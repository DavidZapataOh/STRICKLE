import { parseAbi, parseAbiItem } from "viem";

export const vaultReadAbi = parseAbi([
  "function boxBalance(uint8 asset, uint8 box) view returns (uint256)",
  "function invested(uint8 asset, uint8 box) view returns (uint256)",
  "function unallocated(uint8 asset) view returns (uint256)",
  "function rules(uint8 box) view returns (uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil)",
  "function agent() view returns (address)",
  "function agentPaused() view returns (bool)",
  "function owner() view returns (address)",
  "function swapAdapter() view returns (address)",
  "function swapAdapterFrom() view returns (uint64)",
  "function swapCap() view returns (uint128)",
  "function swapWindow() view returns (uint32)",
  "function EARN_VERSION() view returns (uint8)",
  "function vaultApprovedFrom(address vault) view returns (uint64)",
  "function sharesOf(address vault, uint8 box) view returns (uint256)",
  "function maxInvestBps(uint8 box) view returns (uint16)",
]);

export const events = {
  allocated: parseAbiItem("event Allocated(uint8 indexed asset, uint8 indexed box, uint256 amount, uint256 newBalance)"),
  split: parseAbiItem("event Split(address indexed vault, uint8 indexed asset, uint256 amount)"),
  salaryPaid: parseAbiItem("event SalaryPaid(address indexed vault, uint8 indexed asset, address indexed payee, uint256 amount)"),
  notice: parseAbiItem("event Notice(address indexed vault, uint64 indexed id, bytes sealedData)"),
};
