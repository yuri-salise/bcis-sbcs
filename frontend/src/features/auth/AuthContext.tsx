import React, { createContext, useContext, useState, useEffect } from "react";
import { api, type UserProfile, type LoginResponse } from "../../api/client";

interface AuthContextType {
  user: UserProfile | null;
  roles: string[];
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  hasRole: (roleCode: string) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session from stored token
  useEffect(() => {
    async function bootstrapSession() {
      const token = api.getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await api.getMe();
        setUser(me.user);
        setRoles(me.roles);
        setPermissions(me.permissions);
      } catch {
        api.setToken(null);
        setUser(null);
        setRoles([]);
        setPermissions([]);
      } finally {
        setIsLoading(false);
      }
    }

    bootstrapSession();
  }, []);

  const login = async (username: string, password: string): Promise<LoginResponse> => {
    setIsLoading(true);
    try {
      const result = await api.login(username, password);
      setUser(result.user);
      setRoles(result.roles);
      setPermissions(result.permissions);
      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setIsLoading(false);
    }
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (roles.includes("SUPER_ADMIN")) return true;
    return permissions.includes(permissionCode);
  };

  const hasRole = (roleCode: string): boolean => {
    return roles.includes(roleCode);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        roles,
        permissions,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
