export default function PrivacyPolicy() {
  return (
    <div className="pt-14">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-8">Last updated: January 1, 2025</p>

        <div className="space-y-8 text-sm text-gray-600 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">1. Information We Collect</h2>
            <p>
              We collect information you provide directly — your name, email address, and the
              task entries you create. We also collect basic usage data such as login timestamps
              and feature interactions to improve the product.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">2. How We Use Your Information</h2>
            <p>
              Your data is used to provide and improve iDoneThis. This includes delivering
              email reminders, generating productivity reports, and personalizing your experience.
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">3. Data Storage & Security</h2>
            <p>
              All data is encrypted in transit and at rest. We use industry-standard security
              measures including secure cloud hosting, access controls, and regular security
              audits to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">4. Cookies</h2>
            <p>
              We use essential cookies for authentication and session management. We do not use
              third-party tracking cookies or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">5. Your Rights</h2>
            <p>
              You can access, export, or delete your data at any time from your account settings.
              You may also request a full copy of your data by contacting our support team.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">6. Third-Party Services</h2>
            <p>
              We use third-party services for hosting, email delivery, and analytics. These
              providers are bound by their own privacy policies and our data processing agreements.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">7. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. We will notify you of material changes
              via email or an in-app notification. Continued use of the service constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">8. Contact</h2>
            <p>
              Questions about this policy? Reach out at{" "}
              <a href="mailto:privacy@idonethis.com" className="text-gray-900 underline">
                privacy@idonethis.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}