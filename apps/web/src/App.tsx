import { Spinner, ToastProvider } from '@sunghoon_lee/akron-ui';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, isFieldUser, useAuth } from './auth/AuthContext';
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
import PaymentConfirm from './pages/PaymentConfirm';
import Branches from './pages/Branches';
import Accounts from './pages/Accounts';
import ProductDetail from './pages/ProductDetail';
import PartnerMgmt from './pages/PartnerMgmt';
import CalendarPage from './pages/Calendar';
import FieldLayout from './field/FieldLayout';
import FieldWorkOrders from './field/FieldWorkOrders';
import FieldWorkOrderDetail from './field/FieldWorkOrderDetail';

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

  // 전속업체·현장 작업팀은 관리자 ERP를 쓸 일이 없다 — 라우트 트리 자체를 분리한다.
  // (같은 트리에 두고 catch-all 리다이렉트를 넣으면, 라우터가 "/" 같은 구체적 경로를
  //  와일드카드보다 우선해서 관리자 대시보드로 들어가 버린다.)
  if (isFieldUser(user)) {
    return (
      <Routes>
        <Route path="/field" element={<FieldLayout />}>
          <Route index element={<FieldWorkOrders />} />
          <Route path="work-orders/:id" element={<FieldWorkOrderDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/field" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* 관리자도 현장 화면을 열어볼 수 있다 */}
      <Route path="/field" element={<FieldLayout />}>
        <Route index element={<FieldWorkOrders />} />
        <Route path="work-orders/:id" element={<FieldWorkOrderDetail />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/estimates" element={<Estimates />} />
        <Route path="/estimates/:id" element={<EstimateDetail />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/contracts/:id" element={<ContractDetail />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
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
        <Route path="/partner-mgmt" element={<PartnerMgmt />} />
        <Route path="/org-mgmt" element={<OrgMgmt />} />
        <Route path="/payments-confirm" element={<PaymentConfirm />} />
        <Route path="/branches" element={<Branches />} />
        <Route path="/accounts" element={<Accounts />} />
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
