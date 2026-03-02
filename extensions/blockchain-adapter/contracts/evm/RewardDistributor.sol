// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC-20 interface.
interface IERC20 {
  function transfer(address to, uint256 value) external returns (bool);
}

/// @notice Minimal ECDSA recovery helpers.
library ECDSA {
  function recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
    if (signature.length != 65) revert("invalid signature length");
    bytes32 r;
    bytes32 s;
    uint8 v;
    // solhint-disable-next-line no-inline-assembly
    assembly {
      r := mload(add(signature, 0x20))
      s := mload(add(signature, 0x40))
      v := byte(0, mload(add(signature, 0x60)))
    }
    if (v < 27) v += 27;
    if (v != 27 && v != 28) revert("invalid signature v");
    address signer = ecrecover(digest, v, r, s);
    if (signer == address(0)) revert("invalid signature");
    return signer;
  }
}

/// @notice EIP-712 claim-based reward distributor.
///
/// Security properties:
/// - Off-chain authority signs a claim (EIP-712 typed data)
/// - On-chain verifies signature + deadline + replay protection (claimId)
/// - Transfers ERC-20 held by this contract to recipient
contract RewardDistributor {
  // ---- EIP-712 domain ----

  bytes32 private constant EIP712_DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

  bytes32 private constant NAME_HASH = keccak256("OpenClawRewardDistributor");
  bytes32 private constant VERSION_HASH = keccak256("1");

  bytes32 private immutable _domainSeparator;

  // ---- Claim types ----

  bytes32 public constant CLAIM_TYPEHASH =
    keccak256(
      "RewardClaim(address recipient,address token,uint256 amount,uint256 nonce,uint256 deadline,bytes32 eventHash)"
    );

  address public owner;
  address public authority;

  mapping(bytes32 => bool) public usedClaims;

  event AuthorityUpdated(address indexed authority);
  event Claimed(bytes32 indexed claimId, address indexed recipient, address indexed token, uint256 amount);

  modifier onlyOwner() {
    require(msg.sender == owner, "only owner");
    _;
  }

  constructor(address initialAuthority) {
    owner = msg.sender;
    authority = initialAuthority;
    _domainSeparator = keccak256(
      abi.encode(
        EIP712_DOMAIN_TYPEHASH,
        NAME_HASH,
        VERSION_HASH,
        block.chainid,
        address(this)
      )
    );
    emit AuthorityUpdated(initialAuthority);
  }

  function domainSeparator() external view returns (bytes32) {
    return _domainSeparator;
  }

  function setAuthority(address next) external onlyOwner {
    authority = next;
    emit AuthorityUpdated(next);
  }

  function withdraw(address token, address to, uint256 amount) external onlyOwner {
    _safeTransfer(token, to, amount);
  }

  function claim(
    address recipient,
    address token,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes32 eventHash,
    bytes calldata signature
  ) external {
    require(block.timestamp <= deadline, "expired");

    bytes32 claimId = keccak256(abi.encode(recipient, token, amount, nonce, deadline, eventHash));
    require(!usedClaims[claimId], "already claimed");
    usedClaims[claimId] = true;

    bytes32 structHash = keccak256(
      abi.encode(
        CLAIM_TYPEHASH,
        recipient,
        token,
        amount,
        nonce,
        deadline,
        eventHash
      )
    );

    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));
    address signer = ECDSA.recover(digest, signature);
    require(signer == authority, "unauthorized");

    _safeTransfer(token, recipient, amount);
    emit Claimed(claimId, recipient, token, amount);
  }

  function _safeTransfer(address token, address to, uint256 amount) internal {
    (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
  }
}
