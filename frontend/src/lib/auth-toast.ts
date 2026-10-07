import { toast } from "sonner";

export const authToast = {
  signInSuccess(name?: string) {
    toast.success("Signed in", {
      description: name ? `Welcome back, ${name}.` : "You are now signed in.",
    });
  },
  signInError(message: string) {
    toast.error("Sign in failed", { description: message });
  },
  signUpSuccess() {
    toast.success("Account created", {
      description: "Welcome to Edico. Your workspace is ready.",
    });
  },
  signUpError(message: string) {
    toast.error("Sign up failed", { description: message });
  },
  signUpCodeSent() {
    toast.success("Verification code sent", {
      description: "Check your inbox and enter the 6-digit code below.",
    });
  },
  signUpVerifyError(message: string) {
    toast.error("Verification failed", { description: message });
  },
  forgotPasswordSuccess() {
    toast.success("Reset link sent", {
      description: "If that email is on file, check your inbox for the next step.",
    });
  },
  forgotPasswordError(message: string) {
    toast.error("Request failed", { description: message });
  },
  resetPasswordSuccess() {
    toast.success("Password updated", {
      description: "Redirecting you to sign in…",
    });
  },
  resetPasswordError(message: string) {
    toast.error("Reset failed", { description: message });
  },
  signOutSuccess() {
    toast("Signed out", {
      description: "You have been signed out successfully.",
    });
  },
};
