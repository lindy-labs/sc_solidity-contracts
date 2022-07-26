// SPDX-License-Identifier: MIT
pragma solidity =0.8.10;

// A partial ERC20 interface.
interface IERC20 {
    function balanceOf(address owner) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);
}

// A partial WETH interfaec.
interface IWETH is IERC20 {
    function deposit() external payable;
}

// Demo contract that swaps its ERC20 balance for another ERC20.
// NOT to be used in production.
contract SimpleTokenSwap {
    event BoughtTokens(IERC20 sellToken, IERC20 buyToken, uint256 boughtAmount);

    // The WETH contract.
    IWETH public immutable WETH;
    // Creator of this contract.
    address public owner;

    constructor(IWETH weth) {
        WETH = weth;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    // Payable fallback to allow this contract to receive protocol fee refunds.
    receive() external payable {}

    // Transfer tokens held by this contrat to the sender/owner.
    function withdrawToken(IERC20 token, uint256 amount) external onlyOwner {
        require(token.transfer(msg.sender, amount));
    }

    // Transfer ETH held by this contrat to the sender/owner.
    function withdrawETH(uint256 amount) external onlyOwner {
        payable(msg.sender).transfer(amount);
    }

    // Transfer ETH into this contract and wrap it into WETH.
    function depositETH() external payable {
        WETH.deposit{value: msg.value}();
    }

    // Swaps ERC20->ERC20 tokens held by this contract using a 0x-API quote.
    function fillQuote(
        // The `sellTokenAddress` field from the API response.
        IERC20 sellToken,
        // The `to` field from the API response.
        address payable swapTarget,
        // The `data` field from the API response.
        bytes calldata swapCallData
    )
        external
        payable
        onlyOwner
    // Must attach ETH equal to the `value` field from the API response.
    {
        // Give `spender` an infinite allowance to spend this contract's `sellToken`.
        // Note that for some tokens (e.g., USDT, KNC), you must first reset any existing
        // allowance to 0 before being able to update it.
        require(sellToken.approve(swapTarget, type(uint256).max));
        // Call the encoded swap function call on the contract at `swapTarget`,
        // passing along any ETH attached to this function call to cover protocol fees.
        (bool success, ) = swapTarget.call{value: msg.value}(swapCallData);
        require(success, "SWAP_CALL_FAILED");
    }
}
