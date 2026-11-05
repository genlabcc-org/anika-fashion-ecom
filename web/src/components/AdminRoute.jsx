import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { authService } from "../services/authService";
import SEO from "./SEO";

export default function AdminRoute({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await authService.getUser();
        
        if (!user) {
          setLoading(false);
          return;
        }

        const data = await authService.checkAdminUser(user.id);
        setIsAdmin(data?.role === "admin");
      } catch (error) {
        console.error("Error in admin route check:", error);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center", 
        height: "100vh",
        fontSize: "16px",
        color: "#666"
      }}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <SEO title="Admin Portal" noindex={true} />
      {children}
    </>
  );
}