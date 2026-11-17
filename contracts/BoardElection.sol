// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title BoardElection - bầu thành viên HĐQT theo phương thức bầu dồn phiếu
/// @notice Số phiếu tối đa của cổ đông = số cổ phần tại block snapshot x số ghế.
contract BoardElection is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant ELECTION_ADMIN_ROLE = keccak256("ELECTION_ADMIN_ROLE");
    uint256 public constant MAX_CANDIDATES = 50; // chặn vòng lặp không giới hạn (DoS)

    enum Status { None, Registration, Voting, Closed }

    struct Candidate {
        string name;
        string profileCid; // CID IPFS của hồ sơ ứng viên
        uint256 votes;
    }

    struct Election {
        string title;
        uint8 seats;
        Status status;
        uint256 snapshotBlock;
        uint256 endTime;
        Candidate[] candidates;
        mapping(address => bool) hasVoted;
    }

    IVotes public immutable shareToken;
    uint256 public electionCount;
    mapping(uint256 => Election) private _elections;

    event ElectionCreated(uint256 indexed electionId, string title, uint8 seats);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VotingStarted(uint256 indexed electionId, uint256 snapshotBlock, uint256 endTime);
    event VoteCast(uint256 indexed electionId, address indexed voter, uint256 totalVotes);
    event ElectionClosed(uint256 indexed electionId);

    modifier inStatus(uint256 electionId, Status expected) {
        require(_elections[electionId].status == expected, "Invalid election status");
        _;
    }

    constructor(address token, address admin) {
        require(token != address(0) && admin != address(0), "Zero address");
        shareToken = IVotes(token);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ELECTION_ADMIN_ROLE, admin);
    }

    // ------------------------- Quản trị -------------------------

    function createElection(string calldata title, uint8 seats)
        external
        onlyRole(ELECTION_ADMIN_ROLE)
        whenNotPaused
        returns (uint256 electionId)
    {
        require(seats > 0, "Seats must be > 0");
        electionId = ++electionCount;
        Election storage e = _elections[electionId];
        e.title = title;
        e.seats = seats;
        e.status = Status.Registration;
        emit ElectionCreated(electionId, title, seats);
    }

    function addCandidate(uint256 electionId, string calldata name, string calldata profileCid)
        external
        onlyRole(ELECTION_ADMIN_ROLE)
        whenNotPaused
        inStatus(electionId, Status.Registration)
    {
        Election storage e = _elections[electionId];
        require(e.candidates.length < MAX_CANDIDATES, "Too many candidates");
        e.candidates.push(Candidate(name, profileCid, 0));
        emit CandidateAdded(electionId, e.candidates.length - 1, name);
    }

    /// @notice Mở phiên bỏ phiếu và chốt snapshot tại block liền trước.
    function startVoting(uint256 electionId, uint256 duration)
        external
        onlyRole(ELECTION_ADMIN_ROLE)
        whenNotPaused
        inStatus(electionId, Status.Registration)
    {
        Election storage e = _elections[electionId];
        require(e.candidates.length >= e.seats, "Not enough candidates");
        require(duration > 0, "Duration must be > 0");
        e.snapshotBlock = block.number - 1; // getPastVotes yêu cầu block đã qua
        e.endTime = block.timestamp + duration;
        e.status = Status.Voting;
        emit VotingStarted(electionId, e.snapshotBlock, e.endTime);
    }

    function closeElection(uint256 electionId)
        external
        onlyRole(ELECTION_ADMIN_ROLE)
        inStatus(electionId, Status.Voting)
    {
        Election storage e = _elections[electionId];
        require(block.timestamp > e.endTime, "Voting not ended");
        e.status = Status.Closed;
        emit ElectionClosed(electionId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------- Bỏ phiếu -------------------------

    /// @notice Bỏ phiếu bầu dồn. candidateIds phải tăng dần (chống trùng).
    /// @param candidateIds danh sách ứng viên được bầu
    /// @param amounts số phiếu dồn cho từng ứng viên tương ứng
    function vote(uint256 electionId, uint256[] calldata candidateIds, uint256[] calldata amounts)
        external
        whenNotPaused
        nonReentrant
        inStatus(electionId, Status.Voting)
    {
        Election storage e = _elections[electionId];
        require(block.timestamp <= e.endTime, "Voting ended");
        require(!e.hasVoted[msg.sender], "Already voted");
        require(candidateIds.length == amounts.length && candidateIds.length > 0, "Invalid input");

        // Số phiếu tối đa = cổ phần tại snapshot x số ghế
        uint256 maxVotes = shareToken.getPastVotes(msg.sender, e.snapshotBlock) * e.seats;
        require(maxVotes > 0, "No voting power");

        e.hasVoted[msg.sender] = true; // Effects trước Interactions

        uint256 total;
        for (uint256 i = 0; i < candidateIds.length; i++) {
            require(candidateIds[i] < e.candidates.length, "Candidate not found");
            require(i == 0 || candidateIds[i] > candidateIds[i - 1], "Ids must be ascending");
            total += amounts[i];
            e.candidates[candidateIds[i]].votes += amounts[i];
        }
        require(total <= maxVotes, "Exceeds voting power");

        emit VoteCast(electionId, msg.sender, total);
    }

    // ------------------------- Truy vấn -------------------------

    function getElection(uint256 electionId)
        external
        view
        returns (string memory title, uint8 seats, Status status, uint256 snapshotBlock, uint256 endTime, uint256 candidateCount)
    {
        Election storage e = _elections[electionId];
        return (e.title, e.seats, e.status, e.snapshotBlock, e.endTime, e.candidates.length);
    }

    function getCandidate(uint256 electionId, uint256 candidateId)
        external
        view
        returns (string memory name, string memory profileCid, uint256 votes)
    {
        Candidate storage c = _elections[electionId].candidates[candidateId];
        return (c.name, c.profileCid, c.votes);
    }

    function hasVotedCheck(uint256 electionId, address voter) external view returns (bool) {
        return _elections[electionId].hasVoted[voter];
    }

    /// @notice Số phiếu tối đa mà cổ đông có thể dồn (0 nếu chưa mở phiên).
    function votingPowerOf(uint256 electionId, address voter) external view returns (uint256) {
        Election storage e = _elections[electionId];
        if (e.status == Status.None || e.status == Status.Registration) return 0;
        return shareToken.getPastVotes(voter, e.snapshotBlock) * e.seats;
    }

    /// @notice Kết quả: danh sách ứng viên trúng cử (sau khi đóng phiên).
    /// @return winners ID các ứng viên trúng cử, xếp theo số phiếu giảm dần
    /// @return tied true nếu có đồng phiếu tại ghế cuối cùng (cần bầu lại/xử lý theo điều lệ)
    function getWinners(uint256 electionId)
        external
        view
        inStatus(electionId, Status.Closed)
        returns (uint256[] memory winners, bool tied)
    {
        Election storage e = _elections[electionId];
        uint256 n = e.candidates.length;
        uint256[] memory order = new uint256[](n);
        for (uint256 i = 0; i < n; i++) order[i] = i;

        // Selection sort (n <= MAX_CANDIDATES nên chi phí đọc là chấp nhận được)
        for (uint256 i = 0; i < n; i++) {
            uint256 best = i;
            for (uint256 j = i + 1; j < n; j++) {
                if (e.candidates[order[j]].votes > e.candidates[order[best]].votes) best = j;
            }
            (order[i], order[best]) = (order[best], order[i]);
        }

        winners = new uint256[](e.seats);
        for (uint256 i = 0; i < e.seats; i++) winners[i] = order[i];
        tied = n > e.seats && e.candidates[order[e.seats - 1]].votes == e.candidates[order[e.seats]].votes;
    }
}
