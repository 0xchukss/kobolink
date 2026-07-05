export function SiteFooter() {
  return (
    <footer className='site-footer'>
      <div className='footer-grid'>
        <div>
          <a className='brand-lockup' href='/' aria-label='KoboLink home'>KoboLink</a>
          <p>Autonomous nanopayments for Nigerian creator communities, priced locally and settled on Arc in USDC.</p>
        </div>
        <div>
          <span>Legal</span>
          <a href='/privacy'>Privacy Policy</a>
          <a href='/terms'>Terms of Service</a>
        </div>
        <div>
          <span>Rails</span>
          <a href='/workflows?mode=fan#proof-center'>Testnet receipts</a>
          <a href='/workflows?mode=fan#arc-transfer'>Arc settlement</a>
          <a href='/workflows?mode=fan#x402-settlement'>x402 payments</a>
        </div>
        <div>
          <span>Docs</span>
          <a href='https://github.com/0xchukss/kobolink' target='_blank' rel='noreferrer'>GitHub Repo</a>
          <a href='https://docs.arc.network' target='_blank' rel='noreferrer'>Arc Docs</a>
          <a href='https://github.com/0xchukss/kobolink#readme' target='_blank' rel='noreferrer'>KoboLink Docs</a>
        </div>
      </div>
    </footer>
  );
}