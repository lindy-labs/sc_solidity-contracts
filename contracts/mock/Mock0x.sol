import "hardhat/console.sol";

contract Mock0x {
    uint8 public constant LQTY = 0;
    uint8 public constant LUSD = 1;
    uint8 public constant ETH = 2;

    fallback() external payable {
        // (uint8 from, uint8 to) = abi.decode(msg.data, (uint8, uint8));
        // console.log("asdjflksajflsadfjsdafasd");

        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 1)
            return(ptr, 0x20)
        }
    }

    receive() external payable {}
}
