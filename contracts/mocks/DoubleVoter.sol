// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Hợp đồng giả lập tấn công bỏ phiếu hai lần trong cùng một giao dịch.
///      Chỉ dùng cho mục đích kiểm thử (TC23).
interface IBoardElection {
    function vote(uint256 electionId, uint256[] calldata candidateIds, uint256[] calldata amounts) external;
}

contract DoubleVoter {
    function attack(
        address electionContract,
        uint256 electionId,
        uint256[] calldata candidateIds,
        uint256[] calldata amounts
    ) external {
        IBoardElection election = IBoardElection(electionContract);
        // Lần bỏ phiếu thứ nhất
        election.vote(electionId, candidateIds, amounts);
        // Lần bỏ phiếu thứ hai - phải bị revert
        election.vote(electionId, candidateIds, amounts);
    }
}
