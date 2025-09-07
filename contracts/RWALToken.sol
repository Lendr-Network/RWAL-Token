// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGetCCIPAdmin} from "mock/src/v0.8/ccip/interfaces/IGetCCIPAdmin.sol";
import {IBurnMintERC20Upgradeable} from "mock/src/v0.8/shared/token/ERC20/upgradeable/IBurnMintERC20Upgradeable.sol";

import {AccessControlDefaultAdminRulesUpgradeable} from "mock/src/v0.8/vendor/openzeppelin-solidity-upgradeable/v5.0.2/contracts/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import {Initializable} from "mock/src/v0.8/vendor/openzeppelin-solidity-upgradeable/v5.0.2/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "mock/src/v0.8/vendor/openzeppelin-solidity-upgradeable/v5.0.2/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ERC20VotesUpgradeable} from "mock/src/v0.8/vendor/openzeppelin-solidity-upgradeable/v5.0.2/contracts/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import {ERC20Upgradeable} from "mock/src/v0.8/vendor/openzeppelin-solidity-upgradeable/v5.0.2/contracts/token/ERC20/ERC20Upgradeable.sol";
import {PausableUpgradeable} from "mock/src/v0.8/vendor/openzeppelin-solidity-upgradeable/v5.0.2/contracts/utils/PausableUpgradeable.sol";
import {IAccessControl} from "mock/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/access/IAccessControl.sol";
import {IERC20} from "mock/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/interfaces/IERC20.sol";
import {IERC165} from "mock/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/introspection/IERC165.sol";

/// @title RWAL - Lendr Governance & Utility Token
/// @notice 100M fixed supply governance token with Chainlink CCT bridging
/// @dev Implements ERC20Votes for governance, CCT for cross-chain bridging
contract RWAL is
    Initializable,
    UUPSUpgradeable,
    IBurnMintERC20Upgradeable,
    IGetCCIPAdmin,
    IERC165,
    ERC20VotesUpgradeable,
    PausableUpgradeable,
    AccessControlDefaultAdminRulesUpgradeable
{
    // ================================================================
    // │                           CONSTANTS                          │
    // ================================================================

    /// @dev Maximum supply of RWAL tokens (1B)
    uint256 private constant MAX_SUPPLY = 1_000_000_000e18; //private

    // ================================================================
    // │                            ROLES                             │
    // ================================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // ================================================================
    // │                           ERRORS                             │
    // ================================================================
    
    // check the flow
    error RWAL__MaxSupplyExceeded(uint256 supplyAfterMint); 
    error RWAL__InvalidRecipient(address recipient);
    error RWAL__ZeroAmount();
    error RWAL__ZeroAddress();
    error RWAL__InvalidUpgrade();

    // ================================================================
    // │                           EVENTS                             │
    // ================================================================

    event CCIPAdminTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );
    event EmergencyWithdraw(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    event UpgradeAuthorized(
        address indexed newImplementation,
        address indexed authorizer
    );

    // ================================================================
    // │                        STATE VARIABLES                       │
    // ================================================================

    /// @dev The number of decimals for the token
    uint8 internal i_decimals;

    /// @dev The CCIP Admin address
    address internal s_ccipAdmin;

    // Storage gap for future upgrades
    uint256[49] private __gap;

    // ================================================================
    // │                         CONSTRUCTOR                          │
    // ================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Disable initializers to prevent implementation contract initialization
        _disableInitializers();
    }

    // ================================================================
    // │                        INITIALIZATION                        │
    // ================================================================

    /// @dev Initialize the contract (for proxy deployment)
    function initialize(
        string memory name,
        string memory symbol,
        address admin,
        uint256 preMint,
        uint8 decimals_
    ) public initializer {
        if (admin == address(0)) revert RWAL__ZeroAddress();
        if (preMint > MAX_SUPPLY) revert RWAL__MaxSupplyExceeded(preMint);

        // FIXED: Call initializers in the correct linearized order
        __ERC20_init(name, symbol);
        __EIP712_init(name, "1");
        __Pausable_init();
        __AccessControlDefaultAdminRules_init(0, admin);
        __UUPSUpgradeable_init();

        s_ccipAdmin = admin;
        i_decimals = decimals_;
        // Grant initial roles
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);

        // Pre-mint initial supply if specified
        if (preMint > 0) {
            _mint(admin, preMint);
        }
    }

    // ================================================================
    // │                         MODIFIERS                            │
    // ================================================================

    modifier nonZeroAmount(uint256 amount) {
        if (amount == 0) revert RWAL__ZeroAmount();
        _;
    }

    // ================================================================
    // │                         ERC20 CORE                           │
    // ================================================================

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(AccessControlDefaultAdminRulesUpgradeable, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC20).interfaceId ||
            interfaceId == type(IBurnMintERC20Upgradeable).interfaceId ||
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IAccessControl).interfaceId ||
            interfaceId == type(IGetCCIPAdmin).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @dev Returns the number of decimals used in its user representation
    function decimals() public view virtual override returns (uint8) {
        return i_decimals;
    }

    /// @dev Returns the max supply of the token
    function maxSupply() public pure virtual returns (uint256) {
        return MAX_SUPPLY;
    }

    /// @dev Override _update to handle ERC20Votes and pausing
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override whenNotPaused {
        super._update(from, to, value);
    }

    // ================================================================
    // │                      BURNING & MINTING                       │
    // ================================================================

    /// @inheritdoc IBurnMintERC20Upgradeable
    /// @dev Burns tokens from the caller's account (for CCT bridging)
    function burn(
        uint256 amount
    ) public virtual onlyRole(BURNER_ROLE) nonZeroAmount(amount) {
        _burn(msg.sender, amount);
    }

    /// @inheritdoc IBurnMintERC20Upgradeable
    /// @dev Burns tokens from specified account (for CCT bridging)
    function burn(
        address account,
        uint256 amount
    ) public virtual onlyRole(BURNER_ROLE) nonZeroAmount(amount) {
        if (account == address(0)) revert RWAL__ZeroAddress();

        // Check if caller has allowance (unless it's the account owner)
        if (account != msg.sender) {
            _spendAllowance(account, msg.sender, amount);
        }

        _burn(account, amount);
    }

    /// @inheritdoc IBurnMintERC20Upgradeable
    /// @dev Burns tokens from specified account with allowance check
    function burnFrom(
        address account,
        uint256 amount
    ) public virtual onlyRole(BURNER_ROLE) nonZeroAmount(amount) {
        if (account == address(0)) revert RWAL__ZeroAddress();

        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    /// @inheritdoc IBurnMintERC20Upgradeable
    /// @dev Mints new tokens to specified account (for CCT bridging)
    function mint(
        address account,
        uint256 amount
    ) external onlyRole(MINTER_ROLE) nonZeroAmount(amount) {
        if (account == address(0) || account == address(this)) {
            revert RWAL__InvalidRecipient(account);
        }
        if (totalSupply() + amount > MAX_SUPPLY) {
            revert RWAL__MaxSupplyExceeded(totalSupply() + amount);
        }

        _mint(account, amount);
    }

    // ================================================================
    // │                     EMERGENCY CONTROLS                       │
    // ================================================================

    /// @notice Pauses all token transfers
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /// @notice Unpauses all token transfers
    function unpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    /// @notice Emergency withdrawal of any ERC20 token (except RWAL itself)
    /// @dev SECURITY: This function is controlled by multi-signature wallet
    /// @dev Multi-sig inherently prevents reentrancy through approval process
    /// @param token The token address to withdraw
    /// @param to The recipient address
    /// @param amount The amount to withdraw
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(EMERGENCY_ROLE) nonZeroAmount(amount) {
        if (to == address(0)) revert RWAL__ZeroAddress();
        if (token == address(this)) revert RWAL__InvalidRecipient(token);

        IERC20(token).transfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    // ================================================================
    // │                         ROLE MANAGEMENT                      │
    // ================================================================

    /// @notice Grants both mint and burn roles to an address
    function grantMintAndBurnRoles(
        address burnAndMinter
    ) external onlyRole(ADMIN_ROLE) {
        if (burnAndMinter == address(0)) revert RWAL__ZeroAddress();
        grantRole(MINTER_ROLE, burnAndMinter);
        grantRole(BURNER_ROLE, burnAndMinter);
    }

    /// @notice Returns the current CCIP Admin
    function getCCIPAdmin() external view returns (address) {
        return s_ccipAdmin;
    }

    /// @notice Transfers the CCIP Admin role to a new address
    function setCCIPAdmin(address newAdmin) external onlyRole(ADMIN_ROLE) {
        if (newAdmin == address(0)) revert RWAL__ZeroAddress();
        address currentAdmin = s_ccipAdmin;
        s_ccipAdmin = newAdmin;
        emit CCIPAdminTransferred(currentAdmin, newAdmin);
    }

    // ================================================================
    // │                        UUPS UPGRADE                          │
    // ================================================================

    /// @dev Authorize upgrade (only UPGRADER_ROLE can upgrade)
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {
        if (newImplementation == address(0)) revert RWAL__ZeroAddress();
        if (newImplementation == address(this)) revert RWAL__InvalidUpgrade();

        emit UpgradeAuthorized(newImplementation, msg.sender);
    }

    // ================================================================
    // │                      GOVERNANCE FEATURES                     │
    // ================================================================

    /// @notice Get current voting power of an account
    function getVotes(address account) public view override returns (uint256) {
        return super.getVotes(account);
    }

    /// @notice Get past voting power of an account at a specific timepoint
    function getPastVotes(
        address account,
        uint256 timepoint
    ) public view override returns (uint256) {
        return super.getPastVotes(account, timepoint);
    }

    /// @notice Get past total supply at a specific timepoint
    function getPastTotalSupply(
        uint256 timepoint
    ) public view override returns (uint256) {
        return super.getPastTotalSupply(timepoint);
    }

    /// @notice Delegate voting power to another account
    function delegate(address delegatee) public override {
        super.delegate(delegatee);
    }

    /// @notice Delegate voting power via signature
    function delegateBySig(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override {
        super.delegateBySig(delegatee, nonce, expiry, v, r, s);
    }
}
