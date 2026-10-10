import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { useStore } from "../hooks/useStore";
import { supabase } from "../lib/supabase";
import { getUserInitials } from "../utils/avatarUtils";
import { clean } from "../utils/customerName";
import "./AnikaProfile.css";
import Navbar from "../components/SiteHeader";
import Footer from "../components/SiteFooter";

export default function AnikaProfile() {
  const [activeTab, setActiveTab] = useState("Profile");
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();

  const handleNavClick = (link) => {
    if (link === "Home") {
      navigate("/");
    } else {
      navigate(`/${link.toLowerCase()}`);
    }
  };

  const user = useStore((s) => s.user);
  const sessionLoading = useStore((s) => s.sessionLoading);
  const orders = useStore((s) => s.orders);
  const fetchOrders = useStore((s) => s.fetchOrders);

  // State holds only real values (empty string when missing)
  const [customerDetails, setCustomerDetails] = useState({
    name: "",
    phone: "",
    email: "",
    customerSince: "",
  });
  const [tempDetails, setTempDetails] = useState({ ...customerDetails });

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      navigate("/account/login");
      return;
    }
    fetchOrders(user.id);
  }, [user, sessionLoading]);

  // Depends on user?.id only so it doesn't overwrite an in-progress edit when orders load
  useEffect(() => {
    if (!user?.id) return;

    const fetchProfile = async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        // Query default or first usable address for fallback name and phone
        const { data: addresses } = await supabase
          .from("addresses")
          .select("*")
          .eq("user_id", user.id)
          .order("is_default", { ascending: false });

        const usableAddr = (addresses || []).find((a) => clean(a.full_name) || clean(a.phone_number));

        const joinedDate = user.created_at
          ? new Date(user.created_at).toLocaleDateString("en-IN", {
              month: "short",
              year: "numeric",
            })
          : "Recently";

        // Fallback priority: profile -> user metadata -> address -> ""
        const resolvedName =
          clean(profile?.name) ||
          clean(user.user_metadata?.name) ||
          clean(user.user_metadata?.full_name) ||
          clean(usableAddr?.full_name) ||
          "";

        const resolvedPhone =
          clean(profile?.phone) ||
          clean(user.user_metadata?.phone) ||
          clean(usableAddr?.phone_number) ||
          "";

        const details = {
          name: resolvedName,
          phone: resolvedPhone,
          email: user.email || "",
          customerSince: joinedDate,
        };

        setCustomerDetails(details);
        setTempDetails(details);
      } catch (err) {
        console.error("Error fetching profile from database:", err);
      }
    };

    fetchProfile();
  }, [user?.id]);

  const handleEdit = () => {
    setTempDetails({
      ...customerDetails,
      name: clean(customerDetails.name) || "",
      phone: clean(customerDetails.phone) || "",
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const cleanName = clean(tempDetails.name);
      const cleanPhone = clean(tempDetails.phone);

      // 1. Write NULL (not placeholder or empty string) to profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            name: cleanName || null,
            phone: cleanPhone || null,
            email: user.email,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          }
        );

      if (profileError) throw profileError;

      // 2. Only write non-empty values to auth metadata
      const metaUpdates = {};
      if (cleanName) metaUpdates.name = cleanName;
      if (cleanPhone) metaUpdates.phone = cleanPhone;

      if (Object.keys(metaUpdates).length > 0) {
        await authService.updateUser({
          data: metaUpdates,
        });

        const { session } = await authService.refreshSession();
        if (session?.user) {
          useStore.setState({ user: session.user });
        }
      }

      setCustomerDetails((prev) => ({
        ...prev,
        name: cleanName || "",
        phone: cleanPhone || "",
      }));
      setIsEditing(false);
    } catch (error) {
      alert("Failed to save profile: " + error.message);
    }
  };

  const handleCancel = () => {
    setTempDetails({ ...customerDetails });
    setIsEditing(false);
  };

  const handleChange = (field, value) => {
    setTempDetails((prev) => ({ ...prev, [field]: value }));
  };

  const tabs = ["Profile", "Orders", "Addresses", "Wishlists", "Account"];

  const handleTabClick = (tab) => {
    if (tab === "Orders") {
      navigate("/profile/orders");
    } else if (tab === "Addresses") {
      navigate("/profile/addresses");
    } else if (tab === "Wishlists") {
      navigate("/profile/wishlists");
    } else if (tab === "Account") {
      navigate("/profile/account");
    } else {
      setActiveTab(tab);
    }
  };

  // Total orders count computed at render
  const orderCountStr = `${orders.length} order${orders.length !== 1 ? "s" : ""}`;

  return (
    <>
      <Navbar onLinkClick={handleNavClick} />
      <div className="anika-root">
        <main className="anika-main">
          <h1 className="anika-profile-title">Profile</h1>

          {/* User Info */}
          <div className="anika-user-info">
            <div className="anika-avatar">
              {getUserInitials(customerDetails.name || user?.email)}
            </div>
            <div className="anika-user-text">
              <span className="anika-user-name">{customerDetails.name || "No name set"}</span>
              <span className="anika-user-meta">
                {customerDetails.email} &nbsp;·&nbsp; Member since {customerDetails.customerSince}
              </span>
              <span className="anika-vip-badge">{orderCountStr}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="anika-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`anika-tab${activeTab === tab ? " anika-tab--active" : ""}`}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Customer Details Card */}
          <div className="anika-card">
            <div className="anika-card-header">
              <span className="anika-card-title">Customer details</span>
              <div className="anika-card-header-actions">
                {isEditing ? (
                  <>
                    <button className="anika-save-btn" onClick={handleSave}>Save</button>
                    <button className="anika-cancel-btn" onClick={handleCancel}>Cancel</button>
                  </>
                ) : (
                  <button className="anika-edit-btn" onClick={handleEdit}>Edit</button>
                )}
              </div>
            </div>
            <div className="anika-card-body">
              <div className="anika-detail-row">
                <span className="anika-detail-label">Name</span>
                {isEditing ? (
                  <input
                    className="anika-detail-input"
                    value={tempDetails.name}
                    placeholder="Enter your name"
                    onChange={(e) => handleChange("name", e.target.value)}
                  />
                ) : (
                  <span className="anika-detail-value">{customerDetails.name || "No name set"}</span>
                )}
              </div>
              <div className="anika-detail-row">
                <span className="anika-detail-label">Phone</span>
                {isEditing ? (
                  <input
                    className="anika-detail-input"
                    value={tempDetails.phone}
                    placeholder="Enter your phone"
                    onChange={(e) => handleChange("phone", e.target.value)}
                  />
                ) : (
                  <span className="anika-detail-value">{customerDetails.phone || "No phone set"}</span>
                )}
              </div>
              <div className="anika-detail-row">
                <span className="anika-detail-label">Email</span>
                {/* email is read-only — comes from Supabase Auth */}
                <span className="anika-detail-value">{customerDetails.email}</span>
              </div>
              <div className="anika-detail-row">
                <span className="anika-detail-label">Customer Since</span>
                <span className="anika-detail-value">{customerDetails.customerSince}</span>
              </div>
              <div className="anika-detail-row">
                <span className="anika-detail-label">Total Orders</span>
                <span className="anika-detail-value">{orderCountStr}</span>
              </div>
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}