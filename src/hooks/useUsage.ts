import { useEffect, useState, useCallback } from "react";
import { getMeuUso, type UsoMensal } from "@/lib/usage";

export function useUsage() {
  const [uso, setUso]       = useState<UsoMensal | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getMeuUso();
    setUso(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { uso, loading, refresh };
}
