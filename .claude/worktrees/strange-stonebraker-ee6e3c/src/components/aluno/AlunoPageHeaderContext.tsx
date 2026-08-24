"use client";

import { createContext, useCallback, useContext, useState } from "react";

type PageHeader = {
  title: string;
  subtitle: string;
};

type PageHeaderContextValue = PageHeader & {
  setHeader: (h: Partial<PageHeader>) => void;
  clearHeader: () => void;
};

const PageHeaderContext = createContext<PageHeaderContextValue>({
  title: "",
  subtitle: "",
  setHeader: () => {},
  clearHeader: () => {},
});

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeaderState] = useState<PageHeader>({ title: "", subtitle: "" });

  const setHeader = useCallback((h: Partial<PageHeader>) => {
    setHeaderState((prev) => ({ ...prev, ...h }));
  }, []);

  const clearHeader = useCallback(() => {
    setHeaderState({ title: "", subtitle: "" });
  }, []);

  return (
    <PageHeaderContext.Provider value={{ ...header, setHeader, clearHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  return useContext(PageHeaderContext);
}
