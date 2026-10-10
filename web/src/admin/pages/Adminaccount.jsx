import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { authService } from "../../services/authService";
import { clean } from "../../utils/customerName";
import "./Adminaccount.css";

const Toggle = ({ checked, onChange }) => (
  <button
    className={`aa__toggle${checked ? " aa__toggle--on" : ""}`}
    onClick={() => onChange(!checked)}
    role="switch"
    aria-checked={checked}
    type="button"
  >
    <span className="aa__toggle-thumb" />
  </button>
);

const AdminAccount = () => {
  const [adminName, setAdminName]   = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [phone, setPhone]           = useState("");
  const [role, setRole]             = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [twoFactor, setTwoFactor]   = useState(false);
  const [emailNotif, setEmailNotif] = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const fetchAdminProfile = async () => {
      try {
        setLoading(true);
        const user = await authService.getUser();
        if (user) {
          setAdminEmail(user.email || "");
          
          // Fetch profile from public.profiles
          const { data: profile, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          if (profile) {
            setAdminName(clean(profile.name) || clean(user.user_metadata?.name) || "");
            setPhone(clean(profile.phone) || clean(user.user_metadata?.phone) || "");
          } else {
            setAdminName(clean(user.user_metadata?.name) || "");
            setPhone(clean(user.user_metadata?.phone) || "");
          }

          // Fetch role from admin_users
          const adminInfo = await authService.checkAdminUser(user.id);
          setRole(adminInfo?.role || "admin");
        }
      } catch (error) {
        console.error("Error loading admin profile:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminProfile();
  }, []);

  const handleSaveProfile = async () => {
    try {
      const user = await authService.getUser();
      if (!user) {
        alert("Not logged in");
        return;
      }

      const cleanName = clean(adminName);
      const cleanPhone = clean(phone);

      // Update public.profiles - store NULL when missing, never placeholders or empty strings
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          name: cleanName || null,
          phone: cleanPhone || null,
          email: adminEmail,
          updated_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // Update auth user metadata only with non-empty values
      const metaUpdates = {};
      if (cleanName) metaUpdates.name = cleanName;
      if (cleanPhone) metaUpdates.phone = cleanPhone;

      if (Object.keys(metaUpdates).length > 0) {
        await authService.updateUser({
          data: metaUpdates
        });
      }

      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Error saving profile:", err);
      alert("Error saving profile: " + err.message);
    }
  };

  const handleSavePassword = async () => {
    if (!newPwd || !confirmPwd) {
      alert("Please enter a new password and confirm it");
      return;
    }
    if (newPwd !== confirmPwd) {
      alert("New passwords do not match");
      return;
    }
    if (newPwd.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    try {
      await authService.updateUser({
        password: newPwd
      });
      alert("Password updated successfully!");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      console.error("Error updating password:", err);
      alert("Failed to update password: " + err.message);
    }
  };

  const handleSaveSecurity = () => {
    alert("Security options saved successfully!");
  };

  if (loading) {
    return (
      <div className="aa" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#888' }}>
        Loading admin details...
      </div>
    );
  }

  return (
    <div className="aa">
      <div className="aa__page-header">
        <h1 className="aa__page-title">Settings</h1>
        <p className="aa__page-sub">Admin account</p>
      </div>

      {/* ── Profile section ── */}
      <section className="aa__section">
        <h2 className="aa__section-title">Visibility Options</h2>
        <div className="aa__grid-2">
          <div className="aa__field">
            <label className="aa__label">Admin name</label>
            <input
              className="aa__input"
              type="text"
              placeholder="Input your text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
          </div>
          <div className="aa__field">
            <label className="aa__label">Admin email</label>
            <input
              className="aa__input"
              type="email"
              placeholder="Input your text"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </div>
          <div className="aa__field">
            <label className="aa__label">Phone (for OTP login)</label>
            <input
              className="aa__input"
              type="tel"
              placeholder="Input your text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="aa__field">
            <label className="aa__label">Role</label>
            <input
              className="aa__input"
              type="text"
              placeholder="Input your text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <span className="aa__hint">Role cannot be changed for the primary admin</span>
          </div>
        </div>
        <div className="aa__row-right">
          <button className="aa__btn-save" onClick={handleSaveProfile}>Save Changes</button>
        </div>
      </section>

      {/* ── Change password ── */}
      <section className="aa__section">
        <h2 className="aa__section-title">Change password</h2>
        <div className="aa__field aa__field--full">
          <label className="aa__label">Current password</label>
          <input
            className="aa__input"
            type="password"
            placeholder="Input your text"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
          />
        </div>
        <div className="aa__grid-2 aa__grid-2--mt">
          <div className="aa__field">
            <label className="aa__label">New password</label>
            <input
              className="aa__input"
              type="password"
              placeholder="Min 8 Characters"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />
          </div>
          <div className="aa__field">
            <label className="aa__label">Confirm new password</label>
            <input
              className="aa__input"
              type="password"
              placeholder="Re Enter New Password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
            />
          </div>
        </div>
        <div className="aa__row-right">
          <button className="aa__btn-save" onClick={handleSavePassword}>Save Changes</button>
        </div>
      </section>

      {/* ── Security / visibility options ── */}
      <section className="aa__section">
        <h2 className="aa__section-title">Visibility Options</h2>

        <div className="aa__toggle-row">
          <div className="aa__toggle-info">
            <span className="aa__toggle-label">Two-factor authentication (2FA)</span>
            <span className="aa__toggle-desc">Receive OTP on phone for every admin login</span>
          </div>
          <Toggle checked={twoFactor} onChange={setTwoFactor} />
        </div>

        <div className="aa__toggle-row">
          <div className="aa__toggle-info">
            <span className="aa__toggle-label">Login notification via email</span>
            <span className="aa__toggle-desc">Get an email alert on every new admin login</span>
          </div>
          <Toggle checked={emailNotif} onChange={setEmailNotif} />
        </div>

        <div className="aa__meta-row">
          <span className="aa__meta-label">Last login</span>
          <span className="aa__meta-value">12 May 2026 · 10:24 AM · Chennai, IN</span>
        </div>

        <div className="aa__meta-row">
          <span className="aa__meta-label">Active sessions</span>
          <span className="aa__meta-value">1 device</span>
        </div>

        <div className="aa__row-left">
          <button className="aa__btn-save" onClick={handleSaveSecurity}>Save Changes</button>
        </div>
      </section>
    </div>
  );
};

export default AdminAccount;