import { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authService } from "../services/authService";    
import "./OtpVerify.css";
import otpImg from "../assets/sign/welcome.png";
import Toast from "../components/Toast"
import SEO from "../components/SEO";

export default function OtpVerify() {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [toast, setToast] = useState({message: "", type: ""});
  const inputRefs = useRef([]);

  const location = useLocation();         
  const email = location.state?.email;
  const navigate = useNavigate();

  const showToast = (message, type = "info") => {
    setToast({ message: "", type: ""});
    setTimeout(() => setToast({ message, type}), 10);
  }

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "Enter" && !loading) {
      handleVerify();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    pasted.split("").forEach((char, i) => { newOtp[i] = char; });
    setOtp(newOtp);
    const lastIndex = Math.min(pasted.length, 5);
    inputRefs.current[lastIndex]?.focus();
  };

  const handleVerify = async () => {
    if (loading) return;
    const code = otp.join("");
    if (code.length < 6) {
      showToast("Please enter all 6 digits.", "error");
      return;
    }

    setLoading(true);

    try {
      const data = await authService.verifyOtp(email, code, "email");
      showToast("Login successful!", "success");
      console.log(data);
      setTimeout(() => navigate("/profile"), 1200);
    } catch (error) {
      showToast(error.message, "error");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending || loading) return;
    setResending(true);
    setOtp(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();

    try {
      await authService.signInWithOtp(email);
      showToast("OTP resent!", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="otp-page">
      <SEO title="Verify OTP" noindex={true} />

      <div className="otp-left">
        <img src={otpImg} alt="OTP Image" />
      </div>

      <div className="otp-right">
        <div className="otp-form-wrapper">

          <h1 className="otp-title">Enter OTP</h1>
          <p className="otp-subtitle">
            6-digit code sent to {email ?? "your email"}  {/* ← dynamic email */}
          </p>

          <div className="otp-boxes">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="otp-box"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                disabled={loading}
              />
            ))}
          </div>

          <button
            className="otp-btn-verify"
            onClick={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <span className="otp-btn-loading">
                <span className="otp-spinner" />
                Verifying...
              </span>
            ) : (
              "Verify"
            )}
          </button>

          <p className="otp-resend-text">
            Resend OTP Now!{" "}
            <button 
              className="otp-resend-link"
              onClick={handleResend}
              disabled={loading || resending}
            >
              {resending ? "Resending..." : "Click Here"}
            </button>
          </p>

        </div>
      </div>
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: ""})}
      />
    </div>
  );
}