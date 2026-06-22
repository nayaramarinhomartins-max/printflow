import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Producao() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/producao-massa", { replace: true }); }, [navigate]);
  return null;
}
