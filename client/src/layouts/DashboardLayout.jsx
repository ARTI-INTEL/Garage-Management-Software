import { useAuth } from '../context/AuthContext';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { Users, Car, LayoutDashboard, Settings, LogOut, Wrench, FileText, Package, ClipboardList, BarChart3, KeyRound, Building2 } from 'lucide-react';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navigation = [];

  // Super admins only ever see the garage management panel — no garage data
  if (user?.role === 'super_admin') {
    navigation.push({ name: 'Garages', href: '/garages', icon: Building2 });
    if (!location.pathname.startsWith('/garages')) {
      return <Navigate to="/garages" replace />;
    }
  } else {
    navigation.push(
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Vehicles', href: '/vehicles', icon: Car },
      { name: 'Customers', href: '/customers', icon: Users }
    );

    if (user?.role === 'admin') {
      navigation.push(
        { name: 'Invoices', href: '/invoices', icon: FileText },
        { name: 'Quotations', href: '/quotations', icon: ClipboardList },
        { name: 'Parts', href: '/parts', icon: Package },
        { name: 'Reports', href: '/reports', icon: BarChart3 },
        { name: 'Users', href: '/users', icon: KeyRound },
        { name: 'Settings', href: '/settings', icon: Settings }
      );
    } else {
      // Mechanic nav
      navigation.push(
        { name: 'My Jobs', href: '/my-jobs', icon: Wrench }
      );
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-surface text-white flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-gray-300">
          <Wrench className="text-blue-500" />
          <span className="text-xl font-bold tracking-wider">GMS</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-medium border-l-2 border-blue-500 rounded-l-none'
                    : 'text-gray-700 hover:bg-elevated hover:text-white'
                }`}
              >
                <Icon size={20} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-300">
          <div className="mb-4">
            <p className="text-sm text-gray-400">Logged in as</p>
            <p className="font-medium text-white truncate">{user?.username}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors w-full"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <header className="bg-elevated border-b border-gray-300 px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800 capitalize">
            {location.pathname.split('/')[1] || 'Dashboard'}
          </h1>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;

