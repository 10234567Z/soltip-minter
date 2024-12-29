use anchor_lang::prelude::*;

declare_id!("8ubPzisSkpZ7NMcgK72MZUYfx4XcTL9wh9QaBtanGpLP");

#[program]
pub mod minter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let tip_account = &mut ctx.accounts.tip_account;
        tip_account.tipper = ctx.accounts.tipper.key();
        tip_account.creator = ctx.accounts.creator.key();
        tip_account.total_tips = 0;
        Ok(())
    }

    pub fn send_tip(ctx: Context<SendTip>, amount: u64) -> Result<()> {
        let tip_account = &mut ctx.accounts.tip_account;
        let tipper = &ctx.accounts.tipper;
        let creator = &ctx.accounts.creator;

        // Check that the tipper in the tip account matches the provided tipper
        require!(
            tip_account.tipper == tipper.key(),
            TipError::InvalidTipper
        );

        // Check that the tipper is not the creator
        require!(tipper.key() != creator.key(), TipError::CannotTipSelf);

        // Check that the amount is greater than 0
        require!(amount > 0, TipError::InvalidAmount);

        // Transfer SOL from tipper to creator
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: tipper.to_account_info(),
                to: creator.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        // Update tip account
        tip_account.total_tips = tip_account.total_tips.checked_add(amount).ok_or(TipError::OverflowError)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = tipper,
        space = 8 + 32 + 32 + 8, // discriminator + tipper + creator + total_tips
        seeds = [b"tip_account", tipper.key().as_ref()],
        bump
    )]
    pub tip_account: Account<'info, TipAccount>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: This is safe because we're only storing the pubkey
    pub creator: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendTip<'info> {
    #[account(
        mut,
        seeds = [b"tip_account", tipper.key().as_ref()],
        bump
    )]
    pub tip_account: Account<'info, TipAccount>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: This is safe because we're only transferring SOL to this account
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct TipAccount {
    pub tipper: Pubkey,
    pub creator: Pubkey,
    pub total_tips: u64,
}

#[error_code]
pub enum TipError {
    #[msg("The tipper in the tip account does not match the provided tipper")]
    InvalidTipper,
    #[msg("You cannot tip yourself")]
    CannotTipSelf,
    #[msg("The tip amount must be greater than 0")]
    InvalidAmount,
    #[msg("Arithmetic overflow when adding tip amount")]
    OverflowError,
}

