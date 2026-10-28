import { lazy, Suspense, type ReactNode } from 'react';
import { ToastProvider } from '@sunghoon_lee/akron-ui';
import { PageSkeleton } from './components/ui';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider, isFieldUser, useAuth } from './auth/AuthContext';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import { ErrorBoundary } from './components/ErrorBoundary';

// 화면별로 따로 받는다(라우트 코드 분할) — 첫 화면은 로그인·레이아웃만 받고,
// 무거운 화면(에이전트 빌더·지도·캠페인 편집기 등)은 열 때 받는다.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardEdit = lazy(() => import('./pages/DashboardEdit'));
const DashboardAdmin = lazy(() => import('./pages/DashboardAdmin'));
const DashboardTemplateEdit = lazy(() => import('./pages/DashboardTemplateEdit'));
const DashboardTemplateSettings = lazy(() => import('./pages/DashboardTemplateSettings'));
const Leads = lazy(() => import('./pages/Leads'));
const LeadWorkspace = lazy(() => import('./pages/LeadWorkspace'));
const PublicSign = lazy(() => import('./pages/PublicSign'));
const Estimates = lazy(() => import('./pages/Estimates'));
const EstimateDetail = lazy(() => import('./pages/EstimateDetail'));
const Contracts = lazy(() => import('./pages/Contracts'));
const ContractDetail = lazy(() => import('./pages/ContractDetail'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const Customers = lazy(() => import('./pages/Customers'));
const Products = lazy(() => import('./pages/Products'));
const CbmItems = lazy(() => import('./pages/CbmItems'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const HrPolicies = lazy(() => import('./pages/HrPolicies'));
const Materials = lazy(() => import('./pages/Materials'));
const Settlement = lazy(() => import('./pages/Settlement'));
const Billing = lazy(() => import('./pages/Billing'));
const MaterialOrders = lazy(() => import('./pages/MaterialOrders'));
const ServiceOrders = lazy(() => import('./pages/ServiceOrders'));
const Support = lazy(() => import('./pages/Support'));
const AiAssistant = lazy(() => import('./pages/AiAssistant'));
const AgentBlueprints = lazy(() => import('./pages/AgentBlueprints'));
const AgentBuilder = lazy(() => import('./pages/AgentBuilder'));
const AgentCreate = lazy(() => import('./pages/AgentCreate'));
const CampaignEditor = lazy(() => import('./pages/CampaignEditor'));
const OrgUnits = lazy(() => import('./pages/OrgUnits'));
const ProductMgmt = lazy(() => import('./pages/ProductMgmt'));
const OrgMgmt = lazy(() => import('./pages/OrgMgmt'));
const PaymentConfirm = lazy(() => import('./pages/PaymentConfirm'));
const Branches = lazy(() => import('./pages/Branches'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Leave = lazy(() => import('./pages/Leave'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Accounts = lazy(() => import('./pages/Accounts'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const PartnerMgmt = lazy(() => import('./pages/PartnerMgmt'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const FieldLayout = lazy(() => import('./field/FieldLayout'));
const FieldWorkOrders = lazy(() => import('./field/FieldWorkOrders'));
const FieldWorkOrderDetail = lazy(() => import('./field/FieldWorkOrderDetail'));

/** 화면 코드를 받는 동안 뼈대를 보여 준다. 화면(탭)마다 따로 감싸서, 탭 하나를 받는 동안 다른 탭은 그대로 둔다. */
const page = (el: ReactNode) => <Suspense fallback={<PageSkeleton />}>{el}</Suspense>;

function Shell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', padding: 24, boxSizing: 'border-box' }}>
        <PageSkeleton cards={3} />
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
        <Route path="/field" element={page(<FieldLayout />)}>
          <Route index element={page(<FieldWorkOrders />)} />
          <Route path="work-orders/:id" element={page(<FieldWorkOrderDetail />)} />
        </Route>
        <Route path="*" element={<Navigate to="/field" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* 현장 화면(/field)은 현장 작업팀·전속업체 계정 전용 — 관리자 쪽에선 당분간 감춘다.
          예전에 바탕화면 앱(start_url=/field)으로 설치해 둔 관리자도 여기로 열리면
          아래 catch-all이 대시보드로 보낸다. */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={page(<Dashboard />)} />
        <Route path="/dashboard/edit" element={page(<DashboardEdit />)} />
        <Route path="/dashboard-admin" element={page(<DashboardAdmin />)} />
        <Route path="/dashboard-admin/:id" element={page(<DashboardTemplateEdit />)} />
        <Route path="/dashboard-admin/:id/settings" element={page(<DashboardTemplateSettings />)} />
        <Route path="/ai" element={page(<AiAssistant />)} />
        <Route path="/leads" element={page(<Leads />)} />
        <Route path="/leads/:id" element={page(<LeadWorkspace />)} />
        <Route path="/calendar" element={page(<CalendarPage />)} />
        <Route path="/estimates" element={page(<Estimates />)} />
        <Route path="/estimates/:id" element={page(<EstimateDetail />)} />
        <Route path="/contracts" element={page(<Contracts />)} />
        <Route path="/contracts/:id" element={page(<ContractDetail />)} />
        <Route path="/work-orders" element={page(<WorkOrders />)} />
        <Route path="/work-orders/:id" element={page(<WorkOrderDetail />)} />
        <Route path="/customers" element={page(<Customers />)} />
        <Route path="/products" element={page(<Products />)} />
        <Route path="/products/:id" element={page(<ProductDetail />)} />
        <Route path="/cbm-items" element={page(<CbmItems />)} />
        <Route path="/materials" element={page(<Materials />)} />
        <Route path="/settlements" element={page(<Settlement />)} />
        <Route path="/billing" element={page(<Billing />)} />
        <Route path="/material-orders" element={page(<MaterialOrders />)} />
        <Route path="/service-orders" element={page(<ServiceOrders />)} />
        <Route path="/support" element={page(<Support />)} />
        <Route path="/campaigns" element={page(<Campaigns />)} />
        <Route path="/campaigns/:id" element={page(<CampaignEditor />)} />
        <Route path="/hr" element={page(<HrPolicies />)} />
        <Route path="/org-units" element={page(<OrgUnits />)} />
        {/* 새 메뉴 구조 (CASE: 메뉴 재편) */}
        <Route path="/product-mgmt" element={page(<ProductMgmt />)} />
        <Route path="/partner-mgmt" element={page(<PartnerMgmt />)} />
        <Route path="/org-mgmt" element={page(<OrgMgmt />)} />
        <Route path="/payments-confirm" element={page(<PaymentConfirm />)} />
        <Route path="/branches" element={page(<Branches />)} />
        <Route path="/approvals" element={page(<Approvals />)} />
        <Route path="/leave" element={page(<Leave />)} />
        <Route path="/attendance" element={page(<Attendance />)} />
        <Route path="/accounts" element={page(<Accounts />)} />
        <Route path="/agent-builder" element={page(<AgentBlueprints />)} />
        <Route path="/agent-builder/new" element={page(<AgentCreate />)} />
        <Route path="/agent-builder/:id" element={page(<AgentBuilder />)} />
        {/* 예전 주소(AI 에이전트 관리) */}
        <Route path="/ai-agents/*" element={<Navigate to="/agent-builder" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* 고객이 문자로 받은 견적서·서명 링크 — 로그인 없이 연다 */}
            <Route
              path="/s/:token"
              element={<ErrorBoundary fullPage>{page(<PublicSign />)}</ErrorBoundary>}
            />
            <Route
              path="*"
              element={
                <ErrorBoundary fullPage>
                  <AuthProvider>
                    <Shell />
                  </AuthProvider>
                </ErrorBoundary>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
