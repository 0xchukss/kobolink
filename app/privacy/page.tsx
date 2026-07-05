import { SiteFooter } from '../SiteFooter.js';

export const metadata = {
  title: 'Privacy Policy | KoboLink',
  description: 'Privacy Policy for KoboLink.',
};

export default function PrivacyPage() {
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
        <h2>Privacy Policy</h2>
        <p><strong>Effective Date: July 4, 2026</strong></p>
        <p>KoboLink is a hackathon project built to demonstrate autonomous tipping for Nigerian X creators. This Privacy Policy explains how we handle your data.</p>
        
        <h3>1. Information We Collect</h3>
        <p>When you sign in using Clerk, we collect your authentication details (like email or social login handle) to manage your session. If you use the creator workflow, you may provide public X post links and content, which are stored to generate payment proofs. For fan workflows, budget parameters and simulated payment history are stored to demonstrate the agent's operation.</p>
        
        <h3>2. How We Use Your Information</h3>
        <p>Your information is used strictly to run the autonomous tipping agent, verify settlements on the Arc testnet, and display proof of these operations in the Proof Center. We do not sell your data or use it for targeted advertising.</p>
        
        <h3>3. Public Data and Proofs</h3>
        <p>Because KoboLink is designed around auditable testnet proofs, certain interactions—such as your creator handle, listing details, and testnet transaction hashes—are visible on the public Proof Center to demonstrate settlement verification.</p>
        
        <h3>4. Third-Party Services</h3>
        <p>We use Clerk for authentication. Circle's x402 and the Arc testnet are used for simulated USDC settlements. Flutterwave is used as a sandbox payment gateway. Please review their respective privacy policies to understand how they process information.</p>
        
        <h3>5. Contact Us</h3>
        <p>If you have any questions about this hackathon project, please contact the repository maintainer via the submitted hackathon repository.</p>
      </section>

      <SiteFooter />
    </main>
  );
}
