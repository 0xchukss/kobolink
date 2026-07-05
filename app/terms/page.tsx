import { SiteFooter } from '../SiteFooter.js';

export const metadata = {
  title: 'Terms of Service | KoboLink',
  description: 'Terms of Service for KoboLink.',
};

export default function TermsPage() {
  return (
    <main className='workflow-page' id='main-content'>
      <header className='landing-nav workflow-nav'>
        <a className='brand-lockup' href='/' aria-label='KoboLink home'>
          <span>KoboLink</span>
        </a>
        <nav aria-label='KoboLink navigation'>
          <a href='/use-link'>Use KoboLink</a>
          <a href='/workflows?mode=fan'>Open fan workflow</a>
        </nav>
      </header>

      <section className='section-copy reveal-block' style={{ padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 56px)' }}>
        <h2>Terms of Service</h2>
        <p><strong>Effective Date: July 4, 2026</strong></p>
        
        <h3>1. Acceptance of Terms</h3>
        <p>By accessing or using KoboLink, a hackathon project demonstrating autonomous tipping, you agree to be bound by these Terms of Service. This is a demonstration environment, not a commercial product.</p>
        
        <h3>2. Description of Service</h3>
        <p>KoboLink allows users to simulate tipping Nigerian X creators using Naira display values and USDC settlements on the Arc testnet. All transactions, wallets, and settlements shown within the application are strictly for testing and demonstration purposes on a testnet environment. No real funds are transferred or stored.</p>
        
        <h3>3. User Responsibilities</h3>
        <p>You agree not to use KoboLink for any illegal or unauthorized purpose. You must not attempt to manipulate the testnet proofs, circumvent security features, or use the platform to transmit malicious code.</p>
        
        <h3>4. Limitation of Liability</h3>
        <p>KoboLink is provided "as is" without warranties of any kind. As a hackathon prototype, we are not liable for any data loss, service interruptions, or consequences arising from the use of the platform. You understand that the financial rails simulated (Arc, Circle, Flutterwave) are in sandbox or testnet modes.</p>
        
        <h3>5. Modifications to Service</h3>
        <p>We reserve the right to modify, suspend, or discontinue the service at any time, especially as the hackathon period concludes, without notice or liability.</p>
        
        <h3>6. Governing Law</h3>
        <p>These terms shall be governed by and construed in accordance with applicable general laws, disregarding conflict of law provisions, as is customary for open-source hackathon submissions.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
