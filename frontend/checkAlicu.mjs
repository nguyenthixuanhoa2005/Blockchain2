import { ethers } from 'ethers';
import fs from 'fs';

const dep = JSON.parse(fs.readFileSync('frontend/sepolia-deployment.json'));
const rpc = 'https://ethereum-sepolia-rpc.publicnode.com';
const provider = new ethers.JsonRpcProvider(rpc);
const tokenAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function getPastVotes(address, uint256) view returns (uint256)',
  'function getVotes(address) view returns (uint256)',
  'function delegates(address) view returns (address)'
];
const electionAbi = [
  'function getElection(uint256) view returns (string title, uint8 seats, uint8 status, uint256 snapshotBlock, uint256 endTime, uint256 candidateCount)',
  'function votingPowerOf(uint256, address) view returns (uint256)'
];
const token = new ethers.Contract(dep.contracts.shareToken.address, tokenAbi, provider);
const election = new ethers.Contract(dep.contracts.boardElection.address, electionAbi, provider);

const el = await election.getElection(1);
console.log('Election #1: snapshotBlock =', el.snapshotBlock.toString(), 'status =', el.status.toString(), 'seats =', el.seats.toString());

const wallets = JSON.parse(fs.readFileSync('frontend/company-wallets.json'));
for (const w of wallets) {
  if (w.name.toLowerCase().includes('ali') || w.address.toLowerCase().includes('97ddab')) {
    const bal = await token.balanceOf(w.address);
    const votes = await token.getVotes(w.address);
    const del = await token.delegates(w.address);
    let pastVotes = 'N/A';
    let vp = 'N/A';
    try {
      pastVotes = await token.getPastVotes(w.address, el.snapshotBlock);
      vp = await election.votingPowerOf(1, w.address);
    } catch (err) {
      vp = 'Err: ' + err.message;
    }
    console.log(`Wallet ${w.name} (${w.address}):`);
    console.log(`  balanceOf = ${bal}`);
    console.log(`  delegates = ${del}`);
    console.log(`  getVotes = ${votes}`);
    console.log(`  getPastVotes(${el.snapshotBlock}) = ${pastVotes}`);
    console.log(`  votingPowerOf(#1) = ${vp}`);
  }
}
