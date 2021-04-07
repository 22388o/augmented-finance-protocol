// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.12;

import {IERC20} from '../../dependencies/openzeppelin/contracts/IERC20.sol';
import {SafeERC20} from '../../dependencies/openzeppelin/contracts/SafeERC20.sol';
import {SafeMath} from '../../dependencies/openzeppelin/contracts/SafeMath.sol';

import {BasicAdapter} from '../interfaces/BasicAdapter.sol';
import {IRedeemableToken} from './IRedeemableToken.sol';
import {IMigratorRewardController} from '../interfaces/IRewardDispenser.sol';

import 'hardhat/console.sol';

contract CompAdapter is BasicAdapter {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  IERC20 private _underlyingAsset;

  constructor(
    address originAsset,
    IMigratorRewardController rewardController,
    uint256 rewardFactor,
    address underlyingAsset
  ) public BasicAdapter(originAsset, rewardController, rewardFactor) {
    _underlyingAsset = IERC20(underlyingAsset);
    require(_underlyingAsset.totalSupply() > 0, 'invalid underlying');
  }

  function getUnderlying() internal view override returns (address) {
    return address(_underlyingAsset);
  }

  function transferOriginIn(uint256 amount, address holder) internal override returns (uint256) {
    IERC20(_originAsset).safeTransferFrom(holder, address(this), amount);
    return amount;
  }

  function transferOriginOut(uint256 amount, address holder) internal override returns (uint256) {
    IERC20(_originAsset).safeTransfer(holder, amount);
    return amount;
  }

  function transferTargetOut(uint256 amount, address holder) internal override returns (uint256) {
    IERC20(_targetAsset).safeTransfer(holder, amount);
    return amount;
  }

  function getOriginBalance(address holder) internal view override returns (uint256 amount) {
    return _deposits[holder];
  }

  function totalBalanceForMigrate() external view override returns (uint256) {
    return _totalDeposited;
  }

  function withdrawUnderlyingFromOrigin(address underlying)
    internal
    override
    returns (uint256 amount)
  {
    uint256 underlyingAmount = IERC20(underlying).balanceOf(address(this));
    uint256 withdrawnAmount =
      IRedeemableToken(_originAsset).redeem(
        IRedeemableToken(_originAsset).balanceOf(address(this))
      );
    underlyingAmount = IERC20(underlying).balanceOf(address(this)).sub(underlyingAmount);
    require(underlyingAmount > 0, 'withdrawn less than expected');
    return withdrawnAmount;
  }
}