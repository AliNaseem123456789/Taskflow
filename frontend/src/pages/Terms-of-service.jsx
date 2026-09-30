export default function TermsOfService() {
  return (
    <div className="pt-14">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: January 1, 2025</p>

        <div className="space-y-8 text-sm text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using iDoneThis, you agree to be bound by these Terms of Service.
              If you do not agree, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">2. Description of Service</h2>
            <p>
              iDoneThis is a productivity platform that helps individuals and teams track daily
              accomplishments, set reminders, and generate progress reports.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the security of your account credentials. You
              must provide accurate information when creating an account. One person or entity
              may not maintain more than one free account.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">4. Acceptable Use</h2>
            <p>
              You agree not to use the service for unlawful purposes, to upload malicious
              content, or to attempt to gain unauthorized access to other accounts or systems.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">5. Intellectual Property</h2>
            <p>
              You retain ownership of the content you create. By using the service, you grant
              iDoneThis a limited license to store, display, and process your content solely to
              provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">6. Termination</h2>
            <p>
              Either party may terminate your account at any time. Upon termination, your right
              to access the service ceases immediately. We will retain your data for 30 days
              after termination, after which it will be permanently deleted.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">7. Limitation of Liability</h2>
            <p>
              The service is provided &ldquo;as is&rdquo; without warranties of any kind.
              iDoneThis shall not be liable for any indirect, incidental, or consequential
              damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">8. Changes</h2>
            <p>
              We reserve the right to modify these terms at any time. Material changes will be
              communicated via email. Continued use after changes take effect constitutes
              acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">9. Contact</h2>
            <p>
              Questions? Email{" "}
              <a href="mailto:legal@idonethis.com" className="text-gray-900 underline">
                legal@idonethis.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}