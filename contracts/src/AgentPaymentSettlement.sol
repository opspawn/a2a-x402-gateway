// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentPaymentSettlement
 * @notice Records AI agent-to-agent micropayment settlements on-chain.
 * @dev Deployed on Arbitrum Sepolia for the Arbitrum Open House NYC hackathon.
 *      Part of the OpSpawn A2A x402 Gateway — enabling verifiable agent commerce.
 */
contract AgentPaymentSettlement {
    struct Settlement {
        address payer;
        address payee;
        uint256 amount;
        bytes32 taskId;
        uint256 timestamp;
        bool exists;
    }

    /// @notice Emitted when a new settlement is recorded.
    event SettlementRecorded(
        bytes32 indexed taskId,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Owner of the contract (deployer).
    address public owner;

    /// @notice Mapping from taskId to its settlement record.
    mapping(bytes32 => Settlement) public settlements;

    /// @notice Number of settlements recorded.
    uint256 public settlementCount;

    /// @notice Addresses authorized to record settlements.
    mapping(address => bool) public authorizedRecorders;

    modifier onlyAuthorized() {
        require(
            msg.sender == owner || authorizedRecorders[msg.sender],
            "Not authorized"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedRecorders[msg.sender] = true;
    }

    /**
     * @notice Record a settlement between two agents.
     * @param payer  The address of the paying agent.
     * @param payee  The address of the receiving agent.
     * @param amount The settlement amount (in smallest unit, e.g. wei or USDC decimals).
     * @param taskId A unique identifier for the task being settled.
     */
    function recordSettlement(
        address payer,
        address payee,
        uint256 amount,
        bytes32 taskId
    ) external onlyAuthorized {
        require(!settlements[taskId].exists, "Settlement already exists");
        require(payer != address(0) && payee != address(0), "Invalid address");
        require(amount > 0, "Amount must be > 0");

        settlements[taskId] = Settlement({
            payer: payer,
            payee: payee,
            amount: amount,
            taskId: taskId,
            timestamp: block.timestamp,
            exists: true
        });

        settlementCount++;

        emit SettlementRecorded(taskId, payer, payee, amount, block.timestamp);
    }

    /**
     * @notice Retrieve a settlement by task ID.
     * @param taskId The unique task identifier.
     * @return payer  Address of the payer.
     * @return payee  Address of the payee.
     * @return amount Settlement amount.
     * @return timestamp When the settlement was recorded.
     * @return exists  Whether the settlement exists.
     */
    function getSettlement(bytes32 taskId)
        external
        view
        returns (
            address payer,
            address payee,
            uint256 amount,
            uint256 timestamp,
            bool exists
        )
    {
        Settlement storage s = settlements[taskId];
        return (s.payer, s.payee, s.amount, s.timestamp, s.exists);
    }

    /**
     * @notice Authorize an address to record settlements (e.g. the gateway server).
     * @param recorder The address to authorize.
     */
    function addRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = true;
    }

    /**
     * @notice Remove recorder authorization.
     * @param recorder The address to deauthorize.
     */
    function removeRecorder(address recorder) external onlyOwner {
        authorizedRecorders[recorder] = false;
    }
}
