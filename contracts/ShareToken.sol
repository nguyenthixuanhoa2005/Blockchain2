// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ShareToken - token biểu diễn cổ phần của doanh nghiệp
/// @notice 1 token = 1 cổ phần (decimals = 0). Dùng ERC20Votes để lưu checkpoint
///         số dư theo từng block, phục vụ snapshot quyền biểu quyết.
contract ShareToken is ERC20, ERC20Permit, ERC20Votes, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address admin) ERC20("Share Token", "SHARE") ERC20Permit("Share Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /// @dev Cổ phần là số nguyên, không chia nhỏ.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    /// @notice Cấp phát cổ phần cho cổ đông (chỉ MINTER_ROLE).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    // ---- Ghi đè bắt buộc do đa kế thừa ----

    /// @dev Tự động ủy quyền biểu quyết cho chính mình khi lần đầu nhận token,
    ///      để cổ đông không phải gọi delegate() thủ công.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        if (to != address(0) && delegates(to) == address(0)) {
            _delegate(to, to);
        }
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
