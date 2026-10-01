import BrandMark from "./ui/BrandMark";
// Shared frame for the small auth pages (forgot/reset password, verify email)
export const authInputCls =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white";
export const authButtonCls =
  "w-full btn-accent py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 pt-14">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><BrandMark size={44} word={false} /></div>
          <h1 className="font-display text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
