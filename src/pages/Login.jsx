import React from "react";
import { SignIn } from "@clerk/clerk-react";
import AuthLayout from "@/components/AuthLayout";
import { LogIn } from "lucide-react";

export default function Login() {
  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
    >
      <div className="flex justify-center w-full">
        <SignIn 
          routing="path" 
          path="/login" 
          signUpUrl="/register" 
          fallbackRedirectUrl="/dashboard" 
        />
      </div>
    </AuthLayout>
  );
}
