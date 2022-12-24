pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "node_modules/@openzeppelin/contracts/utils/Create2.sol";

contract SafeMiner {
    function withdraw(address token) public {
        IERC20(token).transfer(
            msg.sender,
            IERC20(token).balanceOf(address(this))
        );
    }
}

contract Solution {
    address[] public contracts;

    function deployContract() public {
        address c = Create2.deploy(
            0,
            bytes32("1"),
            type(SafeMiner).creationCode
        );
        contracts.push(c);
    }

    function getAll() public view returns (address[] memory) {
        return contracts;
    }
}
