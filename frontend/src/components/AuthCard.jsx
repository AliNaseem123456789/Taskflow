// Shared frame for the small auth pages (forgot/reset password, verify email)
export const authInputCls =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white";
export const authButtonCls =
  "w-full bg-gray-900 text-white py-2 rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 pt-14">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-8 h-8 bg-gray-900 rounded mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
