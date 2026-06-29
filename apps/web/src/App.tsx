import { Spinner, ToastProvider } from '@sunghoon_lee/akron-ui';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, useAuth } from './auth/AuthContext';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Estimates from './pages/Estimates';
import EstimateDetail from './pages/EstimateDetail';
import Contracts from './pages/Contracts';
import ContractDetail from './pages/ContractDetail';
import WorkOrders from './pages/WorkOrders';
import WorkOrderDetail from './pages/WorkOrderDetail';
import Customers from './pages/Customers';
import Products from './pages/Products';
import CbmItems from './pages/CbmItems';
import Campaigns from './pages/Campaigns';
import HrPolicies from './pages/HrPolicies';
import Materials from './pages/Materials';
import Settlement from './pages/Settlement';
import Billing from './pages/Billing';
import MaterialOrders from './pages/MaterialOrders';
import ServiceOrders from './pages/ServiceOrders';
import Support from './pages/Support';
import OrgUnits from './pages/OrgUnits';
import ProductMgmt from './pages/ProductMgmt';
import OrgMgmt from './pages/OrgMgmt';
import Placeholder from './pages/Placeholder';

function Shell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/estimates" element={<Estimates />} />
        <Route path="/estimates/:id" element={<EstimateDetail />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/contracts/:id" element={<ContractDetail />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/products" element={<Products />} />
        <Route path="/cbm-items" element={<CbmItems />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/settlements" element={<Settlement />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/material-orders" element={<MaterialOrders />} />
        <Route path="/service-orders" element={<ServiceOrders />} />
        <Route path="/support" element={<Support />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/hr" element={<HrPolicies />} />
        <Route path="/org-units" element={<OrgUnits />} />
        {/* 새 메뉴 구조 (CASE: 메뉴 재편) */}
        <Route path="/product-mgmt" element={<ProductMgmt />} />
        <Route path="/org-mgmt" element={<OrgMgmt />} />
        <Route path="/payments-confirm" element={<Placeholder titleKey="nav.paymentsConfirm" />} />
        <Route path="/branches" element={<Placeholder titleKey="nav.branches" />} />
        <Route path="/accounts" element={<Placeholder titleKey="nav.accounts" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Shell />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
