import "hardhat/console.sol";

contract Mock0x {
    uint8 public constant LQTY = 0;
    uint8 public constant LUSD = 1;
    uint8 public constant ETH = 2;

    fallback() external payable {
        (uint8 from, uint8 to) = abi.decode(msg.data, (uint8, uint8));
        console.log("asdjflksajflsadfjsdafasd");
    }

    // function exchange() external payable {
    //     console.log("asdjflksajflsadfjsdafasd");
    // }

    // function call(bytes calldata data) external payable {
    //     console.log("asdjflksajflsadfjsdafasd");
    // }
}
