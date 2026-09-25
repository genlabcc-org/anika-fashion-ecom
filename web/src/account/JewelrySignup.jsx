import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { authService } from "../services/authService";
import "./JewelrySignup.css";
import Toast from "../components/Toast";
import signupImg from "../assets/sign/welcome.png";
import anikalogo from "../assets/offers/logo.svg";

export default function JewelrySignup() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "" })
  const navigate = useNavigate();
  const location = useLocation();

  const showToast = (message, type = "info") => {
    setToast({ message: "", type: "" });
    setTimeout(() => setToast({ message, type }), 10);
  }

  useEffect(() => {
    if (location.state?.message) {
      showToast(location.state.message, location.state.type || "info");
    }
  }, [location.state]);

  const handleSendOTP = async () => {
    if (loading) return;
    if (!email) {
      showToast("Please enter your email.", "error");
      return;
    }

    setLoading(true);

    try {
      const existingUser = await authService.checkUserExists(email);

      if (existingUser) {
        // Existing user → send OTP directly
        await authService.signInWithOtp(email);
        showToast("OTP sent! Check your email.", "success");
        setTimeout(() => navigate("/account/otp-verify", { state: { email } }), 1200);
      } else {
        // New user → send OTP with create
        await authService.signInWithOtp(email, { shouldCreateUser: true });
        showToast("OTP sent to email!", "success");
        setTimeout(() => navigate("/account/otp-verify", { state: { email } }), 1200);
      }
    } catch (error) {
      showToast(error.message, "error");
      setLoading(false);
    }
  };

  return (
    <div className="jewelry-page">
      <div className="jewelry-left">
        <img src={signupImg} alt="sign up Image" />
      </div>

      <div className="jewelry-right">
        <Link to="/">
          <div className="jewelry-logo">
            <img src={anikalogo} alt="Anika Logo" />
          </div>
        </Link>
        <div className="jewelry-form-wrapper">
          <h2 className="jewelry-title">Get Started Now</h2>

          <label className="jewelry-label" htmlFor="email">
            Enter Email
          </label>
          <input
            id="email"
            type="email"
            className="jewelry-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) {
                handleSendOTP();
              }
            }}
            placeholder=""
            maxLength={32}
            disabled={loading}
          />

          <button
            className="jewelry-btn-otp"
            onClick={handleSendOTP}
            disabled={loading}
          >
            {loading ? (
              <span className="jewelry-btn-loading">
                <span className="jewelry-spinner" />
                Sending OTP...
              </span>
            ) : (
              "Send OTP"
            )}
          </button>

          <div className="jewelry-divider">
            <span className="jewelry-divider-line" />
            <span className="jewelry-divider-text">or</span>
            <span className="jewelry-divider-line" />
          </div>

          <button className="jewelry-btn-google">
            <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>

          <p className="jewelry-signup-text">
            Already have an account? <a href="/account/login">Sign In</a>
          </p>
        </div>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "" })}
      />
    </div>
  );
} 