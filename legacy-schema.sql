-- TigerSys (통인 CS 레거시) 스키마 덤프 (구조만, 데이터 없음)
-- 추출일 자동 / 테이블 361개

-- ================= CREATE TABLE =================

-- [dbo.도로주소]  PK: (없음)
CREATE TABLE [dbo].[도로주소] ([도로명코드] varchar(12) NOT NULL, [도로명] varchar(80) NOT NULL, [도로명로마자] varchar(80) NOT NULL, [읍면동일련번호] varchar(2) NOT NULL, [시도명] varchar(20) NOT NULL, [시도로마자] varchar(40) NOT NULL, [시군구명] varchar(20) NOT NULL, [시군구로마자] varchar(40) NOT NULL, [읍면동명] varchar(20) NOT NULL, [읍면동로마자] varchar(40) NOT NULL, [읍면동구분] char(1) NOT NULL, [읍면동코드] char(3) NOT NULL, [사용여부] char(1) NOT NULL, [변경사유] char(1) NOT NULL, [변경이력정보] varchar(14) NOT NULL, [고시일자] char(8) NOT NULL, [말소일자] char(8) NOT NULL);

-- [dbo.시도군]  PK: (없음)
CREATE TABLE [dbo].[시도군] ([시도명] varchar(20) NOT NULL, [시군구명] varchar(20) NOT NULL);

-- [dbo.음력달력]  PK: (없음)
CREATE TABLE [dbo].[음력달력] ([lvl] nvarchar(255) NULL, [음력] nvarchar(255) NULL, [양력] nvarchar(255) NULL);

-- [dbo.자동토스]  PK: (없음)
CREATE TABLE [dbo].[자동토스] ([No] float NULL, [광역시도] nvarchar(255) NULL, [시군구] nvarchar(255) NULL, [구] nvarchar(255) NULL, [1순위] nvarchar(255) NULL, [2순위] nvarchar(255) NULL, [3순위] nvarchar(255) NULL, [4순위] nvarchar(255) NULL, [5순위] nvarchar(255) NULL, [6순위] nvarchar(255) NULL, [7순위] nvarchar(255) NULL, [8순위] nvarchar(255) NULL);

-- [dbo.자동토스_지역_연결]  PK: (없음)
CREATE TABLE [dbo].[자동토스_지역_연결] ([No] float NULL, [광역시도] nvarchar(255) NULL, [시군구] nvarchar(255) NULL, [구] nvarchar(255) NULL, [읍면동] nvarchar(255) NULL, [순위1] nvarchar(255) NULL, [순위2] nvarchar(255) NULL, [순위3] nvarchar(255) NULL, [순위4] nvarchar(255) NULL, [순위5] nvarchar(255) NULL, [순위6] nvarchar(255) NULL, [순위7] nvarchar(255) NULL, [순위8] nvarchar(255) NULL, [순위9] nvarchar(255) NULL, [순위10] nvarchar(255) NULL, [순위11] nvarchar(255) NULL, [순위12] nvarchar(255) NULL);

-- [dbo.재이용고객_2023]  PK: (없음)
CREATE TABLE [dbo].[재이용고객_2023] ([접수번호] nvarchar(255) NULL);

-- [dbo.재이용고객_접수번호]  PK: (없음)
CREATE TABLE [dbo].[재이용고객_접수번호] ([접수번호] nvarchar(255) NULL);

-- [dbo.주소]  PK: (없음)
CREATE TABLE [dbo].[주소] ([관리번호] varchar(25) NOT NULL, [도로명코드] varchar(12) NOT NULL, [읍면동일련번호] varchar(2) NOT NULL, [지하여부] char(1) NOT NULL, [건물본번] int NULL, [건물부번] int NULL, [기초구역번호] varchar(5) NOT NULL, [변경사유코드] varchar(2) NOT NULL, [고시일자] char(8) NOT NULL, [변경전도로명주소] varchar(25) NOT NULL, [상세주소부여여부] char(1) NULL);

-- [dbo.주소부가정보]  PK: 관리번호
CREATE TABLE [dbo].[주소부가정보] ([관리번호] varchar(25) NOT NULL, [행정동코드] varchar(10) NOT NULL, [행정동명] varchar(20) NOT NULL, [우편번호] char(6) NOT NULL, [우편번호일련번호] varchar(3) NOT NULL, [다량배달처명] varchar(40) NOT NULL, [건축물대장건물명] varchar(40) NOT NULL, [시군구건물명] varchar(200) NOT NULL, [공동주택여부] char(1) NOT NULL);

-- [dbo.지번]  PK: 관리번호, 일련번호
CREATE TABLE [dbo].[지번] ([관리번호] varchar(25) NOT NULL, [일련번호] int NOT NULL, [법정동코드] varchar(10) NOT NULL, [시도명] varchar(20) NOT NULL, [시군구명] varchar(20) NOT NULL, [법정읍면동명] varchar(20) NOT NULL, [법정리명] varchar(20) NOT NULL, [산여부] char(1) NOT NULL, [지번본번] int NULL, [지번부번] int NULL, [대표여부] char(1) NOT NULL);

-- [dbo.토스비]  PK: (없음)
CREATE TABLE [dbo].[토스비] ([No] float NULL, [아파트] nvarchar(255) NULL, [우편번호] float NULL, [거래금액] float NULL, [도로명주소] nvarchar(255) NULL, [도로명건물본번호코드] nvarchar(255) NULL, [도로명건물부번호코드] nvarchar(255) NULL, [도로명코드] nvarchar(255) NULL, [도로명일련번호코드] float NULL, [지역] nvarchar(255) NULL, [구] nvarchar(255) NULL, [법정동] nvarchar(255) NULL, [평수] float NULL, [거래년월] float NULL, [토스비용] float NULL);

-- [dbo.토스비용엑셀]  PK: (없음)
CREATE TABLE [dbo].[토스비용엑셀] ([아파트] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [지역] nvarchar(255) NULL, [구] nvarchar(255) NULL, [법정동] nvarchar(255) NULL, [도로명주소] nvarchar(255) NULL, [도로명건물본번호코드] nvarchar(255) NULL, [도로명건물부번호코드] nvarchar(255) NULL, [도로명코드] nvarchar(255) NULL, [도로명일련번호코드] nvarchar(255) NULL, [거래금액] float NULL, [전용면적] nvarchar(255) NULL, [평] float NULL, [견적토스료] float NULL);

-- [dbo.후주소_202505]  PK: (없음)
CREATE TABLE [dbo].[후주소_202505] ([번호] float NULL, [구분] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [주소] nvarchar(255) NULL);

-- [dbo.후주소_202506]  PK: (없음)
CREATE TABLE [dbo].[후주소_202506] ([번호] float NULL, [구분] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [주소] nvarchar(255) NULL);

-- [dbo.후주소_202507]  PK: (없음)
CREATE TABLE [dbo].[후주소_202507] ([NO] float NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소_202508]  PK: (없음)
CREATE TABLE [dbo].[후주소_202508] ([순번] float NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소10월]  PK: (없음)
CREATE TABLE [dbo].[후주소10월] ([순번] float NULL, [받는사람] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소11월]  PK: (없음)
CREATE TABLE [dbo].[후주소11월] ([순번] float NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소12월]  PK: (없음)
CREATE TABLE [dbo].[후주소12월] ([ 순번 ] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소12월2]  PK: (없음)
CREATE TABLE [dbo].[후주소12월2] ([순번 ] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소2]  PK: (없음)
CREATE TABLE [dbo].[후주소2] ([NO] float NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년1월1]  PK: (없음)
CREATE TABLE [dbo].[후주소26년1월1] ([ 순번 ] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년1월2]  PK: (없음)
CREATE TABLE [dbo].[후주소26년1월2] ([ 순번 ] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년2월1]  PK: (없음)
CREATE TABLE [dbo].[후주소26년2월1] ([순번 ] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년2월2]  PK: (없음)
CREATE TABLE [dbo].[후주소26년2월2] ([순번] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년3월1]  PK: (없음)
CREATE TABLE [dbo].[후주소26년3월1] ([  순번 ] nvarchar(255) NULL, [  받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년3월2]  PK: (없음)
CREATE TABLE [dbo].[후주소26년3월2] ([  순번 ] nvarchar(255) NULL, [  받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년3월3]  PK: (없음)
CREATE TABLE [dbo].[후주소26년3월3] ([ 순번 ] nvarchar(255) NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년3월4]  PK: (없음)
CREATE TABLE [dbo].[후주소26년3월4] ([ 순번] float NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년4월1]  PK: (없음)
CREATE TABLE [dbo].[후주소26년4월1] ([ 순번] nvarchar(255) NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년4월2]  PK: (없음)
CREATE TABLE [dbo].[후주소26년4월2] ([NO] float NULL, [VIP 고객님 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년4월3]  PK: (없음)
CREATE TABLE [dbo].[후주소26년4월3] ([NO] float NULL, [VIP 고객님 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년4월4]  PK: (없음)
CREATE TABLE [dbo].[후주소26년4월4] ([ 순번 ] nvarchar(255) NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년5월1]  PK: (없음)
CREATE TABLE [dbo].[후주소26년5월1] ([순번 ] nvarchar(255) NULL, [  받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년5월2]  PK: (없음)
CREATE TABLE [dbo].[후주소26년5월2] ([순번 ] nvarchar(255) NULL, [ 받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년6월1]  PK: (없음)
CREATE TABLE [dbo].[후주소26년6월1] ([NO] float NULL, [VIP고객님] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소26년6월2]  PK: (없음)
CREATE TABLE [dbo].[후주소26년6월2] ([NO] float NULL, [VIP고객님] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소 ] nvarchar(255) NULL);

-- [dbo.후주소4_5월]  PK: (없음)
CREATE TABLE [dbo].[후주소4_5월] ([순번] float NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] float NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소9월]  PK: (없음)
CREATE TABLE [dbo].[후주소9월] ([순번] float NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.후주소마케팅_06]  PK: (없음)
CREATE TABLE [dbo].[후주소마케팅_06] ([순번] float NULL, [받는사람 ] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [후주소] nvarchar(255) NULL);

-- [dbo.Account]  PK: AccCod
CREATE TABLE [dbo].[Account] ([AccCod] varchar(20) NOT NULL, [AccNo] varchar(50) NOT NULL, [bankCd] char(2) NULL, [Basbalance] float NULL, [depositType] varchar(50) NULL, [remark] varchar(300) NULL);

-- [dbo.AccStatement]  PK: statNo
CREATE TABLE [dbo].[AccStatement] ([statNo] char(10) NOT NULL, [AccCod] varchar(20) NOT NULL, [dealDt] char(8) NOT NULL, [dealTim] char(4) NOT NULL, [conspec] varchar(100) NOT NULL, [IOPerNM] varchar(100) NOT NULL, [Memo] varchar(200) NOT NULL, [ioDiv] char(1) NOT NULL, [Amount] float NULL, [SmsIdx] bigint NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.agencyCoin]  PK: coinNo
CREATE TABLE [dbo].[agencyCoin] ([coinNo] varchar(14) NOT NULL, [beCd] char(6) NULL, [coinDt] char(8) NULL, [coinTim] char(4) NULL, [coinDiv] char(1) NOT NULL, [coin] float NULL, [conspec] varchar(500) NOT NULL, [deleteYN] char(1) NULL, [recNum] char(12) NULL, [recSeq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.agencyCoin_20221019]  PK: (없음)
CREATE TABLE [dbo].[agencyCoin_20221019] ([coinNo] varchar(14) NOT NULL, [beCd] char(6) NULL, [coinDt] char(8) NULL, [coinTim] char(4) NULL, [coinDiv] char(1) NOT NULL, [coin] float NULL, [conspec] varchar(500) NOT NULL, [deleteYN] char(1) NULL, [recNum] char(12) NULL, [recSeq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.agencyCoin_20240104]  PK: (없음)
CREATE TABLE [dbo].[agencyCoin_20240104] ([coinNo] varchar(14) NOT NULL, [beCd] char(6) NULL, [coinDt] char(8) NULL, [coinTim] char(4) NULL, [coinDiv] char(1) NOT NULL, [coin] float NULL, [conspec] varchar(500) NOT NULL, [deleteYN] char(1) NULL, [recNum] char(12) NULL, [recSeq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AgencyCoinGroup]  PK: yearMonth, recNum, recSeq, visitDt, beCd
CREATE TABLE [dbo].[AgencyCoinGroup] ([yearMonth] varchar(6) NOT NULL, [recNum] varchar(12) NOT NULL, [recSeq] varchar(3) NOT NULL, [visitDt] varchar(8) NOT NULL, [beCd] varchar(6) NOT NULL, [memId] varchar(20) NOT NULL, [commission] float NULL, [tax] float NULL, [addr] varchar(300) NULL, [regDt] varchar(8) NULL);

-- [dbo.AI_API_ETC]  PK: etcNo
CREATE TABLE [dbo].[AI_API_ETC] ([etcNo] varchar(10) NOT NULL, [regDat] varchar(8) NOT NULL, [regTim] varchar(6) NOT NULL, [serReqDt] varchar(8) NOT NULL, [visitDt] varchar(8) NOT NULL, [reqName] varchar(50) NOT NULL, [hphone] varchar(20) NULL, [phone] varchar(20) NULL, [recPath] varchar(2) NULL, [frZipCd] varchar(6) NULL, [frAddr1] varchar(80) NULL, [frAddr2] varchar(80) NULL, [toZipCd] varchar(6) NULL, [toAddr1] varchar(80) NULL, [toAddr2] varchar(80) NULL, [memo] varchar(1000) NULL, [recPathText] varchar(1000) NULL, [addrRecYN] varchar(1) NULL, [confirmYN] varchar(1) NULL, [confirmEmp] varchar(20) NULL, [confirmMemo] varchar(1000) NULL, [RECNUM] varchar(20) NULL);

-- [dbo.ApiKeys]  PK: apiKey
CREATE TABLE [dbo].[ApiKeys] ([apiKey] varchar(100) NOT NULL, [keyName] varchar(100) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] varchar(20) NULL, [recPath] varchar(2) NOT NULL, [useYN] varchar(1) NULL, [itemCd] varchar(6) NULL, [runYN] varchar(1) NULL, [remark] varchar(300) NULL);

-- [dbo.ApiReceipt]  PK: idx
CREATE TABLE [dbo].[ApiReceipt] ([idx] int NOT NULL, [regDat] varchar(8) NOT NULL, [APIKEY] varchar(100) NOT NULL, [serReqDt] varchar(8) NOT NULL, [visitDt] varchar(8) NOT NULL, [reqName] varchar(50) NOT NULL, [hphone] varchar(20) NULL, [phone] varchar(20) NULL, [frPyung] int NULL, [frZipCd] varchar(6) NULL, [frAddr1] varchar(80) NULL, [frAddr2] varchar(80) NULL, [toPyung] int NULL, [toZipCd] varchar(6) NULL, [toAddr1] varchar(80) NULL, [toAddr2] varchar(80) NULL, [insertDate] smalldatetime NULL, [RECNUM] varchar(30) NULL, [ITEMCDS] varchar(200) NULL, [memo] varchar(1000) NULL, [recPathText] varchar(1000) NULL, [addRecYN] varchar(1) NULL);

-- [dbo.apt]  PK: (없음)
CREATE TABLE [dbo].[apt] ([No] float NULL, [아파트명] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [거래금액] float NULL, [면적] nvarchar(255) NULL, [평] float NULL, [토스비용] float NULL, [시도] nvarchar(255) NULL, [구군] nvarchar(255) NULL, [동] nvarchar(255) NULL, [도로명주소] nvarchar(255) NULL, [본번호코드] nvarchar(255) NULL, [부번호코드] nvarchar(255) NULL, [도로명코드] nvarchar(255) NULL, [도로명일련번호] nvarchar(255) NULL, [regDt] nvarchar(255) NULL, [regEmpCd] nvarchar(255) NULL, [modiDt] nvarchar(255) NULL, [modiEmpCd] nvarchar(255) NULL);

-- [dbo.apt_20240807]  PK: (없음)
CREATE TABLE [dbo].[apt_20240807] ([No] float NULL, [아파트명] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [거래금액] float NULL, [면적] float NULL, [평] float NULL, [토스비용] float NULL, [시도] nvarchar(255) NULL, [구군] nvarchar(255) NULL, [동] nvarchar(255) NULL, [도로명 주소] nvarchar(255) NULL, [본번호코드] nvarchar(255) NULL, [부번호코드] nvarchar(255) NULL, [도로명코드] nvarchar(255) NULL, [도로명일련번호] nvarchar(255) NULL, [등록일자] nvarchar(255) NULL, [수정일자] nvarchar(255) NULL);

-- [dbo.apt_excel]  PK: (없음)
CREATE TABLE [dbo].[apt_excel] ([아파트명] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [거래금액] float NULL, [면적] float NULL, [평] float NULL, [토스비용] float NULL, [시도] nvarchar(255) NULL, [구군] nvarchar(255) NULL, [동] nvarchar(255) NULL, [도로명 주소] nvarchar(255) NULL, [본번호코드] nvarchar(255) NULL, [부번호코드] nvarchar(255) NULL, [도로명코드] nvarchar(255) NULL, [도로명일련번호] nvarchar(255) NULL, [F15] nvarchar(255) NULL, [ ] nvarchar(255) NULL);

-- [dbo.AptMoveIn]  PK: aptIdx
CREATE TABLE [dbo].[AptMoveIn] ([aptIdx] char(12) NOT NULL, [moveInDt] char(6) NOT NULL, [moveOutDt] char(6) NOT NULL, [sellDt] char(6) NOT NULL, [areaText] varchar(100) NOT NULL, [complexNm] varchar(100) NOT NULL, [FamilyCnt] int NULL, [BuildCmp] varchar(100) NULL, [procStat] varchar(2) NULL, [FinDt] char(8) NULL, [supplyArea] varchar(30) NULL, [BussDiv] varchar(50) NULL, [sellQA] varchar(200) NULL, [memo] varchar(500) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AptTossCost]  PK: idx
CREATE TABLE [dbo].[AptTossCost] ([idx] int NOT NULL, [aptNm] varchar(50) NOT NULL, [zipCd] varchar(6) NOT NULL, [sido] varchar(50) NOT NULL, [gugun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [roadAddr] varchar(50) NOT NULL, [roadNo1] varchar(10) NOT NULL, [roadNo2] varchar(10) NOT NULL, [roadCode] varchar(10) NOT NULL, [roadSeq] varchar(10) NOT NULL, [aptAmt] numeric(20,0) NULL, [area] float NULL, [pyung] float NULL, [tossCost] float NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AptTossCost_20240101]  PK: (없음)
CREATE TABLE [dbo].[AptTossCost_20240101] ([idx] int NOT NULL, [aptNm] varchar(50) NOT NULL, [zipCd] varchar(6) NOT NULL, [sido] varchar(50) NOT NULL, [gugun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [roadAddr] varchar(50) NOT NULL, [roadNo1] varchar(10) NOT NULL, [roadNo2] varchar(10) NOT NULL, [roadCode] varchar(10) NOT NULL, [roadSeq] varchar(10) NOT NULL, [aptAmt] numeric(20,0) NULL, [area] float NULL, [pyung] float NULL, [tossCost] float NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AptTossCost_20240104]  PK: (없음)
CREATE TABLE [dbo].[AptTossCost_20240104] ([idx] int NOT NULL, [aptNm] varchar(50) NOT NULL, [zipCd] varchar(6) NOT NULL, [sido] varchar(50) NOT NULL, [gugun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [roadAddr] varchar(50) NOT NULL, [roadNo1] varchar(10) NOT NULL, [roadNo2] varchar(10) NOT NULL, [roadCode] varchar(10) NOT NULL, [roadSeq] varchar(10) NOT NULL, [aptAmt] numeric(20,0) NULL, [area] float NULL, [pyung] float NULL, [tossCost] float NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AptTossCost_20240630]  PK: (없음)
CREATE TABLE [dbo].[AptTossCost_20240630] ([idx] int NOT NULL, [aptNm] varchar(50) NOT NULL, [zipCd] varchar(6) NOT NULL, [sido] varchar(50) NOT NULL, [gugun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [roadAddr] varchar(50) NOT NULL, [roadNo1] varchar(10) NOT NULL, [roadNo2] varchar(10) NOT NULL, [roadCode] varchar(10) NOT NULL, [roadSeq] varchar(10) NOT NULL, [aptAmt] numeric(20,0) NULL, [area] float NULL, [pyung] float NULL, [tossCost] float NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AptTossCost_20240711]  PK: (없음)
CREATE TABLE [dbo].[AptTossCost_20240711] ([idx] int NOT NULL, [aptNm] varchar(50) NOT NULL, [zipCd] varchar(6) NOT NULL, [sido] varchar(50) NOT NULL, [gugun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [roadAddr] varchar(50) NOT NULL, [roadNo1] varchar(10) NOT NULL, [roadNo2] varchar(10) NOT NULL, [roadCode] varchar(10) NOT NULL, [roadSeq] varchar(10) NOT NULL, [aptAmt] numeric(20,0) NULL, [area] float NULL, [pyung] float NULL, [tossCost] float NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.area_20260201]  PK: (없음)
CREATE TABLE [dbo].[area_20260201] ([rdlsgottmqs] float NULL, [시도] nvarchar(255) NULL, [구군] nvarchar(255) NULL, [동] nvarchar(255) NULL, [도로명] nvarchar(255) NULL, [소속] nvarchar(255) NULL, [F7] nvarchar(255) NULL, [사원] nvarchar(255) NULL, [F9] nvarchar(255) NULL, [우선순위] float NULL, [사용여부] float NULL, [비고] nvarchar(255) NULL);

-- [dbo.AreaGuGun]  PK: sido, gubun
CREATE TABLE [dbo].[AreaGuGun] ([sido] nvarchar(40) NOT NULL, [gubun] nvarchar(40) NOT NULL);

-- [dbo.AreaStat]  PK: yearMonth, recType, sido, gugun, dong
CREATE TABLE [dbo].[AreaStat] ([yearMonth] char(8) NOT NULL, [recType] char(2) NOT NULL, [sido] varchar(20) NOT NULL, [gugun] varchar(20) NOT NULL, [dong] varchar(20) NOT NULL, [salAmt] float NULL, [recCnt] float NULL, [contCnt] float NULL, [CancelCnt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ASInfoDet]  PK: asNum, asSeq
CREATE TABLE [dbo].[ASInfoDet] ([asNum] char(10) NOT NULL, [asSeq] char(3) NOT NULL, [procBeCd] char(6) NOT NULL, [procEmp] varchar(8) NOT NULL, [procDt] char(8) NOT NULL, [procDesc] varchar(4000) NULL, [procAmt] float NULL, [procStat] char(2) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ASInfoDet_bak]  PK: (없음)
CREATE TABLE [dbo].[ASInfoDet_bak] ([asNum] char(10) NOT NULL, [asSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [reqDesc] varchar(2000) NOT NULL, [itemCd] char(6) NULL, [procEmp] char(8) NULL, [procAmt] float NULL, [procDt] char(8) NULL, [procDesc] varchar(2000) NULL, [procStat] char(2) NULL, [regDt] char(8) NULL, [regEmpCd] char(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] char(8) NULL);

-- [dbo.ASInfoMst]  PK: asNum
CREATE TABLE [dbo].[ASInfoMst] ([asNum] char(10) NOT NULL, [asDat] char(8) NOT NULL, [asDiv] char(2) NOT NULL, [asType] char(2) NOT NULL, [memId] char(10) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [stat] char(2) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] varchar(8) NOT NULL, [reqDesc] varchar(4000) NULL, [assignBeCd] varchar(6) NOT NULL, [assignEmpCod] varchar(8) NOT NULL, [remark] varchar(4000) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ASInfoMst_bak]  PK: (없음)
CREATE TABLE [dbo].[ASInfoMst_bak] ([asNum] char(10) NOT NULL, [memID] char(10) NOT NULL, [reciDt] char(8) NOT NULL, [empCod] char(8) NOT NULL, [asDiv] char(2) NULL, [stat] char(2) NOT NULL, [recTel] varchar(20) NULL, [remark] varchar(100) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.AuthButton]  PK: btnCd
CREATE TABLE [dbo].[AuthButton] ([btnCd] char(3) NOT NULL, [btnNm] varchar(30) NOT NULL, [btn01] char(1) NOT NULL, [btn02] char(1) NOT NULL, [btn03] char(1) NOT NULL, [btn04] char(1) NOT NULL, [btn05] char(1) NOT NULL, [btn06] char(1) NOT NULL, [btn07] char(1) NOT NULL, [btn08] char(1) NOT NULL, [btn09] char(1) NOT NULL, [btn10] char(1) NOT NULL, [btn11] char(1) NOT NULL, [btn12] char(1) NOT NULL, [btn13] char(1) NOT NULL, [btn14] char(1) NULL, [btn15] char(1) NULL, [useYN] char(1) NULL);

-- [dbo.AuthMenuBtn]  PK: menuCd
CREATE TABLE [dbo].[AuthMenuBtn] ([menuCd] varchar(20) NOT NULL, [btn01] char(1) NOT NULL, [btn02] char(1) NOT NULL, [btn03] char(1) NOT NULL, [btn04] char(1) NOT NULL, [btn05] char(1) NOT NULL, [btn06] char(1) NOT NULL, [btn07] char(1) NOT NULL, [btn08] char(1) NOT NULL, [btn09] char(1) NOT NULL, [btn10] char(1) NOT NULL, [btn11] char(1) NOT NULL, [btn12] char(1) NOT NULL, [btn13] char(1) NOT NULL);

-- [dbo.AuthMenuInfo]  PK: menuCd
CREATE TABLE [dbo].[AuthMenuInfo] ([menuCd] varchar(20) NOT NULL, [menuNm] varchar(30) NOT NULL, [menuUrl] varchar(120) NULL, [upMenuCd] varchar(20) NULL, [menuType] char(1) NULL, [menuDepth] int NULL, [useYN] char(1) NULL, [seqNum] char(3) NULL);

-- [dbo.AuthTemp]  PK: tempCd
CREATE TABLE [dbo].[AuthTemp] ([tempCd] char(3) NOT NULL, [tempNm] varchar(30) NOT NULL, [useYN] char(1) NULL);

-- [dbo.AuthTempMenu]  PK: tempCd, menuCd
CREATE TABLE [dbo].[AuthTempMenu] ([tempCd] char(3) NOT NULL, [menuCd] varchar(20) NOT NULL, [btnCd] char(3) NOT NULL, [clsCd] varchar(6) NOT NULL);

-- [dbo.AuthUserRoll]  PK: empCod, menuCd
CREATE TABLE [dbo].[AuthUserRoll] ([empCod] varchar(20) NOT NULL, [menuCd] varchar(20) NOT NULL, [btnCd] char(3) NOT NULL, [clsCd] varchar(6) NOT NULL);

-- [dbo.AuthUserRoll_20141202]  PK: (없음)
CREATE TABLE [dbo].[AuthUserRoll_20141202] ([empCod] varchar(20) NOT NULL, [menuCd] varchar(20) NOT NULL, [btnCd] char(3) NOT NULL, [clsCd] varchar(6) NOT NULL);

-- [dbo.AuthUserRoll_20200106]  PK: (없음)
CREATE TABLE [dbo].[AuthUserRoll_20200106] ([empCod] varchar(20) NOT NULL, [menuCd] varchar(20) NOT NULL, [btnCd] char(3) NOT NULL, [clsCd] varchar(6) NOT NULL);

-- [dbo.AuthUserRollLog]  PK: logIdx
CREATE TABLE [dbo].[AuthUserRollLog] ([logIdx] int NOT NULL, [empCod] varchar(20) NOT NULL, [menuCd] varchar(20) NOT NULL, [progId] varchar(50) NOT NULL, [remark] varchar(50) NOT NULL, [regEmpCod] varchar(20) NULL, [reglogDate] smalldatetime NULL);

-- [dbo.AUTO_TOSS_DATA]  PK: autoId
CREATE TABLE [dbo].[AUTO_TOSS_DATA] ([autoId] int NOT NULL, [regDt] varchar(8) NULL, [recNum] varchar(20) NOT NULL, [recSeq] varchar(3) NOT NULL, [serReqDt] varchar(8) NULL, [addr] varchar(200) NOT NULL, [sido] varchar(50) NOT NULL, [gubun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [expBeCd] varchar(6) NOT NULL, [empCod] varchar(20) NULL, [procDt] varchar(8) NOT NULL, [procTim] varchar(6) NOT NULL, [procYN] varchar(1) NULL, [remark] varchar(100) NULL, [createAt] smalldatetime NULL, [dupCnt] int NULL);

-- [dbo.AUTO_TOSS_TIME]  PK: idx
CREATE TABLE [dbo].[AUTO_TOSS_TIME] ([idx] int NOT NULL, [sDate] varchar(8) NOT NULL, [sTime] varchar(4) NOT NULL, [eDate] varchar(8) NOT NULL, [eTime] varchar(4) NOT NULL, [sido] varchar(50) NULL, [gugun] varchar(50) NULL, [dong] varchar(50) NULL, [useYn] varchar(1) NOT NULL, [remark] varchar(200) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Belong]  PK: beCd
CREATE TABLE [dbo].[Belong] ([beCd] varchar(6) NOT NULL, [beNm] varchar(30) NOT NULL, [sBeNm] varchar(30) NULL, [upBeCd] varchar(6) NOT NULL, [div1] char(1) NULL, [div2] char(1) NULL, [div3] char(1) NULL, [div4] char(1) NULL, [div5] char(1) NULL, [phone] varchar(20) NULL, [fax] varchar(20) NULL, [bossNm] varchar(20) NULL, [bussNo] char(10) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [payDt] varchar(8) NULL, [bankCd] char(2) NULL, [accNo] varchar(30) NULL, [allilInfo] varchar(100) NULL, [etcInfo] varchar(500) NULL, [useYN] char(1) NULL, [taxYN] char(1) NULL, [calYN] char(1) NULL, [inCharge] varchar(30) NULL, [inChargePos] varchar(30) NULL, [inChargeHP] varchar(30) NULL, [inChargeDirNo] varchar(30) NULL, [areaCd] char(2) NULL, [seq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.BELONG_20150310]  PK: (없음)
CREATE TABLE [dbo].[BELONG_20150310] ([beCd] varchar(6) NOT NULL, [beNm] varchar(30) NOT NULL, [upBeCd] varchar(6) NOT NULL, [div1] char(1) NULL, [div2] char(1) NULL, [div3] char(1) NULL, [div4] char(1) NULL, [div5] char(1) NULL, [phone] varchar(20) NULL, [fax] varchar(20) NULL, [bossNm] varchar(20) NULL, [bussNo] char(10) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [payDt] varchar(8) NULL, [bankCd] char(2) NULL, [accNo] varchar(30) NULL, [allilInfo] varchar(100) NULL, [etcInfo] varchar(500) NULL, [useYN] char(1) NULL, [taxYN] char(1) NULL, [calYN] char(1) NULL, [inCharge] varchar(30) NULL, [inChargePos] varchar(30) NULL, [inChargeHP] varchar(30) NULL, [inChargeDirNo] varchar(30) NULL, [areaCd] char(2) NULL, [seq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.belong_20240825]  PK: (없음)
CREATE TABLE [dbo].[belong_20240825] ([beCd] varchar(6) NOT NULL, [beNm] varchar(30) NOT NULL, [upBeCd] varchar(6) NOT NULL, [div1] char(1) NULL, [div2] char(1) NULL, [div3] char(1) NULL, [div4] char(1) NULL, [div5] char(1) NULL, [phone] varchar(20) NULL, [fax] varchar(20) NULL, [bossNm] varchar(20) NULL, [bussNo] char(10) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [payDt] varchar(8) NULL, [bankCd] char(2) NULL, [accNo] varchar(30) NULL, [allilInfo] varchar(100) NULL, [etcInfo] varchar(500) NULL, [useYN] char(1) NULL, [taxYN] char(1) NULL, [calYN] char(1) NULL, [inCharge] varchar(30) NULL, [inChargePos] varchar(30) NULL, [inChargeHP] varchar(30) NULL, [inChargeDirNo] varchar(30) NULL, [areaCd] char(2) NULL, [seq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Belong_20250422]  PK: (없음)
CREATE TABLE [dbo].[Belong_20250422] ([beCd] varchar(6) NOT NULL, [beNm] varchar(30) NOT NULL, [sBeNm] varchar(30) NULL, [upBeCd] varchar(6) NOT NULL, [div1] char(1) NULL, [div2] char(1) NULL, [div3] char(1) NULL, [div4] char(1) NULL, [div5] char(1) NULL, [phone] varchar(20) NULL, [fax] varchar(20) NULL, [bossNm] varchar(20) NULL, [bussNo] char(10) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [payDt] varchar(8) NULL, [bankCd] char(2) NULL, [accNo] varchar(30) NULL, [allilInfo] varchar(100) NULL, [etcInfo] varchar(500) NULL, [useYN] char(1) NULL, [taxYN] char(1) NULL, [calYN] char(1) NULL, [inCharge] varchar(30) NULL, [inChargePos] varchar(30) NULL, [inChargeHP] varchar(30) NULL, [inChargeDirNo] varchar(30) NULL, [areaCd] char(2) NULL, [seq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Belong_backup]  PK: (없음)
CREATE TABLE [dbo].[Belong_backup] ([beCd] varchar(6) NOT NULL, [beNm] varchar(30) NOT NULL, [upBeCd] varchar(6) NOT NULL, [div1] char(1) NULL, [div2] char(1) NULL, [div3] char(1) NULL, [div4] char(1) NULL, [div5] char(1) NULL, [phone] varchar(20) NULL, [fax] varchar(20) NULL, [bossNm] varchar(20) NULL, [bussNo] char(10) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [payDt] char(8) NULL, [bankCd] char(2) NULL, [accNo] varchar(30) NULL, [allilInfo] varchar(100) NULL, [etcInfo] varchar(500) NULL, [useYN] char(1) NULL, [seq] char(3) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.belong_excel]  PK: (없음)
CREATE TABLE [dbo].[belong_excel] ([소속코드] nvarchar(255) NULL, [지점명] nvarchar(255) NULL, [지점장명] nvarchar(255) NULL, [전화번호] nvarchar(255) NULL, [주소] nvarchar(255) NULL, [사업자번호] nvarchar(255) NULL);

-- [dbo.belong_upload]  PK: (없음)
CREATE TABLE [dbo].[belong_upload] ([beCd] nvarchar(6) NULL, [beNm] nvarchar(30) NULL, [upBeCd] nvarchar(6) NULL, [div1] nvarchar(1) NULL, [div2] nvarchar(1) NULL, [div3] nvarchar(1) NULL, [div4] nvarchar(1) NULL, [div5] nvarchar(1) NULL, [phone] nvarchar(20) NULL, [fax] nvarchar(20) NULL, [bossNm] nvarchar(20) NULL, [bussNo] nvarchar(10) NULL, [zipCod] nvarchar(7) NULL, [addr1] nvarchar(80) NULL, [addr2] nvarchar(80) NULL, [payDt] nvarchar(8) NULL, [bankCd] nvarchar(2) NULL, [accNo] nvarchar(30) NULL, [allilInfo] nvarchar(100) NULL, [etcInfo] nvarchar(500) NULL, [useYN] nvarchar(1) NULL, [regDt] nvarchar(8) NULL, [regEmpCd] nvarchar(8) NULL, [modiDt] nvarchar(8) NULL, [modiEmpCd] nvarchar(8) NULL);

-- [dbo.BelongCar]  PK: carInx
CREATE TABLE [dbo].[BelongCar] ([carInx] int NOT NULL, [becd] varchar(6) NOT NULL, [tonCd] char(2) NOT NULL, [CarNum] varchar(50) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.BeLongCteTBL]  PK: beCd
CREATE TABLE [dbo].[BeLongCteTBL] ([beCd] varchar(6) NOT NULL, [beNm] varchar(30) NOT NULL, [upBeCd] varchar(6) NOT NULL, [lvl] int NOT NULL, [FullNm] nvarchar(255) NOT NULL, [FULLCDS] varchar(255) NOT NULL, [Sort] nvarchar(255) NOT NULL, [div1] char(1) NULL, [div2] char(1) NULL, [div3] char(1) NULL, [div4] char(1) NULL, [div5] char(1) NULL, [phone] varchar(20) NULL, [fax] varchar(20) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [useYN] char(1) NULL, [taxYn] char(1) NULL, [calYn] char(1) NULL);

-- [dbo.BranchAppraisal]  PK: appYear, seqNum, beCd
CREATE TABLE [dbo].[BranchAppraisal] ([appYear] char(4) NOT NULL, [seqNum] char(1) NOT NULL, [beCd] char(6) NOT NULL, [calVal] float NULL, [wrkVal1] float NULL, [wrkVal2] float NULL, [wrkVal3] float NULL, [sudVal1] float NULL, [sudVal2] float NULL, [sudVal3] float NULL, [csVal1] float NULL, [csVal2] float NULL, [csVal3] float NULL, [partVal] float NULL, [totalVal] float NULL, [remark] varchar(300) NULL);

-- [dbo.BranchAppraisal_20130107]  PK: (없음)
CREATE TABLE [dbo].[BranchAppraisal_20130107] ([appYear] char(4) NOT NULL, [seqNum] char(1) NOT NULL, [beCd] char(6) NOT NULL, [calVal] float NULL, [wrkVal1] float NULL, [wrkVal2] float NULL, [wrkVal3] float NULL, [sudVal1] float NULL, [sudVal2] float NULL, [sudVal3] float NULL, [csVal1] float NULL, [csVal2] float NULL, [csVal3] float NULL, [partVal] float NULL, [totalVal] float NULL, [remark] varchar(300) NULL);

-- [dbo.bussCard]  PK: cardNo
CREATE TABLE [dbo].[bussCard] ([cardNo] char(12) NOT NULL, [beCd] char(6) NOT NULL, [empCod] char(8) NOT NULL, [compNm] varchar(30) NOT NULL, [PosNm] varchar(20) NULL, [Nm] varchar(30) NULL, [teamNM] varchar(30) NULL, [zipCod] char(6) NULL, [Addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [compTel] varchar(14) NULL, [HPhone] varchar(14) NULL, [FaxNo] varchar(14) NULL, [eMail] varchar(80) NULL, [homePage] varchar(80) NULL, [remark] varchar(500) NULL, [publicDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBalance]  PK: calNo
CREATE TABLE [dbo].[CalBalance] ([calNo] char(10) NOT NULL, [calDt] char(8) NOT NULL, [beCd] char(6) NOT NULL, [calDiv] char(1) NOT NULL, [accnCd] char(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(50) NULL, [Remark] varchar(200) NULL, [refDiv] char(2) NULL, [refNum] varchar(30) NULL, [calYN] char(1) NULL, [deleteFlag] char(1) NULL, [calDesc] varchar(200) NULL, [createYN] char(1) NULL, [cfmDt] char(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBalance_20210409]  PK: (없음)
CREATE TABLE [dbo].[CalBalance_20210409] ([calNo] char(10) NOT NULL, [calDt] char(8) NOT NULL, [beCd] char(6) NOT NULL, [calDiv] char(1) NOT NULL, [accnCd] char(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(50) NULL, [Remark] varchar(200) NULL, [refDiv] char(2) NULL, [refNum] varchar(30) NULL, [calYN] char(1) NULL, [deleteFlag] char(1) NULL, [calDesc] varchar(200) NULL, [createYN] char(1) NULL, [cfmDt] char(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBalance_20210712]  PK: (없음)
CREATE TABLE [dbo].[CalBalance_20210712] ([calNo] char(10) NOT NULL, [calDt] char(8) NOT NULL, [beCd] char(6) NOT NULL, [calDiv] char(1) NOT NULL, [accnCd] char(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(50) NULL, [Remark] varchar(200) NULL, [refDiv] char(2) NULL, [refNum] varchar(30) NULL, [calYN] char(1) NULL, [deleteFlag] char(1) NULL, [calDesc] varchar(200) NULL, [createYN] char(1) NULL, [cfmDt] char(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBalance_commission]  PK: contNo
CREATE TABLE [dbo].[CalBalance_commission] ([contNo] char(12) NOT NULL, [movComm] float NULL, [optComm] float NULL, [wrkAmt] float NULL, [Remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBalance_sim]  PK: (없음)
CREATE TABLE [dbo].[CalBalance_sim] ([calNo] char(10) NOT NULL, [calDt] char(8) NOT NULL, [beCd] char(6) NOT NULL, [calDiv] char(1) NOT NULL, [accnCd] char(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(50) NULL, [Remark] varchar(50) NULL, [refDiv] char(2) NULL, [refNum] varchar(30) NULL, [calYN] char(1) NULL, [deleteFlag] char(1) NULL, [calDesc] varchar(200) NULL, [createYN] char(1) NULL, [cfmDt] char(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBalancePrtLog]  PK: idx
CREATE TABLE [dbo].[CalBalancePrtLog] ([idx] int NOT NULL, [regDt] char(8) NULL, [regTim] char(6) NULL, [EmpCd] varchar(8) NULL, [balanceTxt] varchar(200) NULL, [yearMonth] char(6) NULL, [becd] varchar(6) NULL);

-- [dbo.CalBlanceToss]  PK: tossCalNo
CREATE TABLE [dbo].[CalBlanceToss] ([tossCalNo] char(10) NOT NULL, [beCd] char(6) NOT NULL, [yearMonth] char(6) NOT NULL, [visitDt] char(8) NOT NULL, [memId] char(10) NOT NULL, [commission] float NULL, [tax] float NULL, [addr] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBlanceWork]  PK: workCalNo
CREATE TABLE [dbo].[CalBlanceWork] ([workCalNo] char(10) NOT NULL, [beCd] char(6) NOT NULL, [yearMonth] char(6) NOT NULL, [workDt] char(8) NOT NULL, [div] varchar(30) NOT NULL, [memId] char(10) NOT NULL, [movAmt] float NULL, [optAmt] float NULL, [movComm] float NULL, [optComm] float NULL, [contAmt] float NULL, [workAmt] float NULL, [netAmt] float NULL, [itemCd] char(6) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalBlanceWork_sample]  PK: (없음)
CREATE TABLE [dbo].[CalBlanceWork_sample] ([workCalNo] char(10) NOT NULL, [beCd] char(6) NOT NULL, [yearMonth] char(6) NOT NULL, [workDt] char(8) NOT NULL, [div] varchar(30) NOT NULL, [memId] char(10) NOT NULL, [movAmt] float NULL, [optAmt] float NULL, [movComm] float NULL, [optComm] float NULL, [contAmt] float NULL, [workAmt] float NULL, [netAmt] float NULL, [itemCd] char(6) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalCusBalance]  PK: cusCalNo
CREATE TABLE [dbo].[CalCusBalance] ([cusCalNo] char(10) NOT NULL, [chargeYM] char(6) NOT NULL, [beCd] char(6) NOT NULL, [Div] char(1) NOT NULL, [serReqDt] char(8) NOT NULL, [payDt] varchar(8) NULL, [chargeDt] varchar(8) NOT NULL, [memId] char(10) NOT NULL, [itemCd] char(6) NOT NULL, [fromAddr] varchar(100) NULL, [toAddr] varchar(100) NULL, [qty] float NULL, [distance] float NULL, [movAmt] float NULL, [optAmt] float NULL, [amt] float NULL, [tax] float NULL, [totAmt] float NULL, [recBeCd] char(6) NULL, [contBeCd] char(6) NULL, [workBeCd] char(6) NULL, [chargeYN] char(1) NULL, [Remark] varchar(50) NULL, [recNum] char(12) NOT NULL, [calYN] char(1) NULL, [createYN] char(1) NULL, [publishDt] char(8) NULL, [billYN] char(1) NULL, [billDt] char(8) NULL, [billAmt] float NULL, [billRemark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.calCusBalance_temp]  PK: (없음)
CREATE TABLE [dbo].[calCusBalance_temp] ([cusCalNo] char(10) NOT NULL, [chargeYM] char(6) NOT NULL, [beCd] char(6) NOT NULL, [Div] char(1) NOT NULL, [serReqDt] char(8) NOT NULL, [payDt] varchar(8) NULL, [chargeDt] varchar(8) NOT NULL, [memId] char(10) NOT NULL, [itemCd] char(6) NOT NULL, [fromAddr] varchar(100) NULL, [toAddr] varchar(100) NULL, [qty] float NULL, [distance] float NULL, [movAmt] float NULL, [optAmt] float NULL, [amt] float NULL, [tax] float NULL, [totAmt] float NULL, [recBeCd] char(6) NULL, [contBeCd] char(6) NULL, [workBeCd] char(6) NULL, [chargeYN] char(1) NULL, [Remark] varchar(50) NULL, [recNum] char(12) NOT NULL, [calYN] char(1) NULL, [createYN] char(1) NULL, [publishDt] char(8) NULL, [billYN] char(1) NULL, [billDt] char(8) NULL, [billRemark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.call_Proc_list]  PK: src_uid
CREATE TABLE [dbo].[call_Proc_list] ([src_uid] varchar(50) NOT NULL, [src_div] char(1) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL);

-- [dbo.CALLBACK_INTERNET]  PK: CBID
CREATE TABLE [dbo].[CALLBACK_INTERNET] ([CBID] varchar(20) NOT NULL, [CALLDATE] varchar(8) NOT NULL, [CALLTIME] varchar(10) NOT NULL, [CID_NUM] varchar(20) NOT NULL, [PROCYN] varchar(1) NULL, [APIKEY] varchar(100) NOT NULL, [regDt] smalldatetime NULL, [CallBackEmpCd] varchar(20) NULL, [callBackDt] smalldatetime NULL);

-- [dbo.callBack_Proc_list]  PK: src_uid
CREATE TABLE [dbo].[callBack_Proc_list] ([src_uid] varchar(50) NOT NULL, [src_div] char(1) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL);

-- [dbo.CallNotice]  PK: callNidx
CREATE TABLE [dbo].[CallNotice] ([callNidx] int NOT NULL, [noticeMemo] varchar(MAX) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalPerBalance]  PK: perCalNo
CREATE TABLE [dbo].[CalPerBalance] ([perCalNo] char(10) NOT NULL, [calYM] char(6) NOT NULL, [workDt] char(8) NOT NULL, [wrkDiv] char(3) NOT NULL, [memId] char(10) NOT NULL, [beCd] char(6) NOT NULL, [empCod] char(8) NOT NULL, [recType] char(2) NOT NULL, [contDt] char(8) NOT NULL, [itemCd] char(6) NOT NULL, [workBecd] char(6) NOT NULL, [workEmp] char(8) NOT NULL, [salAmt] float NULL, [unit] char(2) NULL, [salQty] float NULL, [salPrice] float NULL, [calDiv] char(3) NULL, [reaContEmp] char(8) NOT NULL, [contNo] char(12) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [wrkAmt] float NULL, [sumUp] varchar(50) NULL, [Remark] varchar(50) NULL, [div] char(1) NOT NULL, [amt] float NULL, [deleteFlag] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalTypeDet]  PK: calDiv, seqNum
CREATE TABLE [dbo].[CalTypeDet] ([calDiv] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [wrkDiv] char(3) NULL, [fromVal] float NULL, [toVal] float NULL, [div] char(1) NULL, [extraPay] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CalTypeMst]  PK: calDiv
CREATE TABLE [dbo].[CalTypeMst] ([calDiv] char(3) NOT NULL, [calDivNm] varchar(30) NOT NULL, [useYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Category]  PK: cateCd
CREATE TABLE [dbo].[Category] ([cateCd] char(6) NOT NULL, [cateNm] varchar(30) NOT NULL, [upCateCd] varchar(6) NOT NULL, [remark] varchar(500) NOT NULL, [seq] char(3) NULL, [useYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ChargeType]  PK: chTypeCd
CREATE TABLE [dbo].[ChargeType] ([chTypeCd] char(2) NOT NULL, [chTypeNm] varchar(30) NOT NULL, [chareCal] varchar(100) NOT NULL, [remark] varchar(100) NOT NULL, [useYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CidList]  PK: idx
CREATE TABLE [dbo].[CidList] ([idx] int IDENTITY NOT NULL, [cidDate] char(8) NOT NULL, [gubun] char(1) NULL, [phone] varchar(20) NOT NULL, [cidname] varchar(30) NOT NULL, [memid] varchar(10) NOT NULL, [locNo] varchar(10) NOT NULL, [regDt] smalldatetime NULL);

-- [dbo.CodeD]  PK: CdDiv, ComCd
CREATE TABLE [dbo].[CodeD] ([CdDiv] varchar(5) NOT NULL, [ComCd] varchar(20) NOT NULL, [ComNm] varchar(50) NOT NULL, [CdRRule1] varchar(40) NULL, [CdRRule2] varchar(200) NULL, [CdRRule3] varchar(40) NULL, [UseYn] char(1) NULL, [Seq] char(3) NULL);

-- [dbo.CodeM]  PK: CdDiv
CREATE TABLE [dbo].[CodeM] ([CdDiv] varchar(5) NOT NULL, [CdDivNm] varchar(50) NOT NULL, [CdRRule] varchar(40) NULL);

-- [dbo.CollectBillsDet]  PK: collectNo, seqNum
CREATE TABLE [dbo].[CollectBillsDet] ([collectNo] varchar(14) NOT NULL, [seqNum] char(3) NOT NULL, [memId] char(10) NOT NULL, [itemCd] char(6) NOT NULL, [collectBill] float NULL, [RefCompReqNo] varchar(14) NOT NULL, [RefSeqNum] char(3) NOT NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CollectBillsMst]  PK: collectNo
CREATE TABLE [dbo].[CollectBillsMst] ([collectNo] varchar(14) NOT NULL, [publishDt] char(8) NOT NULL, [collectDt] char(8) NOT NULL, [collectDiv] char(2) NULL, [collectEmp] char(8) NULL, [beCd] char(6) NULL, [CollectBillSum] float NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CompReqDet]  PK: compReqNo, seqNum
CREATE TABLE [dbo].[CompReqDet] ([compReqNo] varchar(14) NOT NULL, [seqNum] char(3) NOT NULL, [serReqDt] char(8) NOT NULL, [memId] char(10) NOT NULL, [itemCd] char(6) NOT NULL, [qty] float NULL, [distance] float NULL, [movAmt] float NULL, [optAmt] float NULL, [amt] float NULL, [tax] float NULL, [totAmt] float NULL, [recBeCd] char(6) NULL, [contBeCd] char(6) NULL, [workBeCd] char(6) NULL, [chargeYN] char(1) NULL, [fromAddr] varchar(100) NULL, [toAddr] varchar(100) NULL, [Remark] varchar(50) NULL, [recNum] char(12) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CompReqMst]  PK: compReqNo
CREATE TABLE [dbo].[CompReqMst] ([compReqNo] varchar(14) NOT NULL, [reqDat] char(8) NOT NULL, [beCd] varchar(6) NOT NULL, [reqEmpCod] varchar(8) NOT NULL, [payDt] varchar(8) NOT NULL, [Div] char(1) NOT NULL, [amt] float NULL, [tax] float NULL, [totAmt] float NULL, [remark] varchar(200) NULL, [memo] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDet]  PK: contNo, contSeq
CREATE TABLE [dbo].[ContractDet] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDET_20210528]  PK: (없음)
CREATE TABLE [dbo].[ContractDET_20210528] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDet_20220112]  PK: (없음)
CREATE TABLE [dbo].[ContractDet_20220112] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Contractdet_bakcup]  PK: (없음)
CREATE TABLE [dbo].[Contractdet_bakcup] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDet_CT2021050006]  PK: (없음)
CREATE TABLE [dbo].[ContractDet_CT2021050006] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDet_CT2021050013]  PK: (없음)
CREATE TABLE [dbo].[ContractDet_CT2021050013] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDetHis]  PK: contNo, contSeq, hisSeq
CREATE TABLE [dbo].[ContractDetHis] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [hisSeq] char(3) NOT NULL, [f_serReqDt] char(8) NOT NULL, [f_itemCd] char(6) NOT NULL, [f_recType] char(2) NOT NULL, [f_unit] char(2) NOT NULL, [f_price] float NULL, [f_qty] float NULL, [f_amt] float NULL, [t_serReqDt] char(8) NOT NULL, [t_itemCd] char(6) NOT NULL, [t_recType] char(2) NOT NULL, [t_unit] char(2) NOT NULL, [t_price] float NULL, [t_qty] float NULL, [t_amt] float NULL, [reason] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractDetReq]  PK: contNo, reqSeq, contSeq
CREATE TABLE [dbo].[ContractDetReq] ([contNo] char(12) NOT NULL, [reqSeq] char(3) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [StatMode] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMst]  PK: contNo
CREATE TABLE [dbo].[ContractMst] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMst_20210528]  PK: (없음)
CREATE TABLE [dbo].[ContractMst_20210528] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMst_20220112]  PK: (없음)
CREATE TABLE [dbo].[ContractMst_20220112] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMst_20240516]  PK: (없음)
CREATE TABLE [dbo].[ContractMst_20240516] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Contractmst_bakcup]  PK: (없음)
CREATE TABLE [dbo].[Contractmst_bakcup] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMst_CT2021050006]  PK: (없음)
CREATE TABLE [dbo].[ContractMst_CT2021050006] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMst_CT2021050013]  PK: (없음)
CREATE TABLE [dbo].[ContractMst_CT2021050013] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ContractMstReq]  PK: contNo, reqSeq
CREATE TABLE [dbo].[ContractMstReq] ([contNo] char(12) NOT NULL, [reqSeq] char(3) NOT NULL, [reqDat] char(8) NULL, [reqRes] varchar(300) NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [reqProcStat] char(1) NULL, [personAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Coupon]  PK: coupNo
CREATE TABLE [dbo].[Coupon] ([coupNo] varchar(50) NOT NULL, [coupNm] varchar(100) NOT NULL, [coupDt] char(8) NOT NULL, [itemCd] char(6) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] varchar(8) NOT NULL, [ToBeCd] char(6) NOT NULL, [valdDt] char(8) NOT NULL, [useDt] char(8) NULL, [useYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.CouponPubli]  PK: PubliSeq
CREATE TABLE [dbo].[CouponPubli] ([PubliSeq] float NOT NULL, [PubliNum] nvarchar(50) NOT NULL, [PubliGubn] char(2) NULL, [PubliDt] varchar(8) NULL, [BeCd] varchar(6) NULL, [EmpCd] char(8) NULL, [Remark] varchar(100) NULL, [PubliCnt] float NULL, [PubliSate] char(2) NULL, [PubliRedt] varchar(8) NULL, [Memid] varchar(10) NULL, [ItemCd] char(6) NULL);

-- [dbo.CouponSms]  PK: idx
CREATE TABLE [dbo].[CouponSms] ([idx] int IDENTITY NOT NULL, [coupDt] char(8) NOT NULL, [coupNo] varchar(50) NOT NULL, [coupNm] varchar(100) NOT NULL, [sendDt] char(8) NULL, [sendDiv] char(1) NULL, [itemCd] char(6) NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [memNm] varchar(30) NOT NULL, [hphone] varchar(20) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [valdDt] char(8) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Customer]  PK: cusCode
CREATE TABLE [dbo].[Customer] ([cusCode] varchar(8) NOT NULL, [cusName] varchar(30) NULL, [ownName] varchar(20) NULL, [uptae] varchar(14) NULL, [jongMok] varchar(14) NULL, [busNo] varchar(10) NULL, [telNo] varchar(14) NULL, [hpNo] varchar(14) NULL, [eMail] varchar(100) NULL, [zipNo] char(6) NULL, [addr1] varchar(100) NULL, [addr2] varchar(100) NULL, [inCharge] varchar(30) NULL, [beCd] char(6) NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Deadline]  PK: yearMonth, deadCode
CREATE TABLE [dbo].[Deadline] ([yearMonth] char(6) NOT NULL, [deadCode] char(2) NOT NULL, [deadYN] char(1) NOT NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.del_AuthUserRoll]  PK: (없음)
CREATE TABLE [dbo].[del_AuthUserRoll] ([empCod] varchar(20) NOT NULL, [menuCd] varchar(20) NOT NULL, [btnCd] char(3) NOT NULL, [clsCd] varchar(6) NOT NULL);

-- [dbo.Del_ContractDet]  PK: (없음)
CREATE TABLE [dbo].[Del_ContractDet] ([contNo] char(12) NOT NULL, [contSeq] char(3) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Del_ContractMst]  PK: (없음)
CREATE TABLE [dbo].[Del_ContractMst] ([contNo] char(12) NOT NULL, [contDt] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [reaContEmp] char(8) NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Tel1] varchar(20) NULL, [Tel2] varchar(20) NULL, [suppAmt] float NULL, [selfAmt] float NULL, [reqMonth] char(6) NOT NULL, [contAmt] float NULL, [contDay] char(8) NULL, [balance] float NULL, [balaDay] char(8) NULL, [totAmt] float NULL, [payDiv] char(2) NULL, [cardComp] char(3) NULL, [cardNo] varchar(40) NULL, [valiDt] char(6) NULL, [cvcCod] varchar(10) NULL, [memo] varchar(500) NULL, [reqDesc] varchar(500) NULL, [careDesc] varchar(500) NULL, [contDesc] varchar(500) NULL, [procYN] char(1) NULL, [PersonAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.del_item]  PK: (없음)
CREATE TABLE [dbo].[del_item] ([itemCd] char(6) NOT NULL, [itemNm] varchar(50) NOT NULL, [shItemNm] varchar(50) NULL, [beCd] varchar(6) NOT NULL, [withBeCd] varchar(6) NULL, [cateCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [baseQty] float NULL, [amount] float NULL, [salAmt] float NULL, [suppAmt] float NULL, [calDiv] char(3) NULL, [taxYN] char(1) NULL, [recType] char(2) NULL, [itemInfo] varchar(500) NULL, [imgFile] varchar(50) NULL, [endDt] char(8) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.del_MacAddressMng]  PK: (없음)
CREATE TABLE [dbo].[del_MacAddressMng] ([empCod] varchar(20) NOT NULL, [SeqNum] char(3) NOT NULL, [MacAddr] varchar(50) NOT NULL, [PcName] varchar(50) NOT NULL, [RegDat] char(8) NULL, [RegTim] char(6) NULL, [ModiDat] char(8) NULL, [ModiTim] char(6) NULL, [UseYn] char(1) NULL, [DelFlag] char(1) NULL);

-- [dbo.Del_ReceiptDet]  PK: (없음)
CREATE TABLE [dbo].[Del_ReceiptDet] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [iRecDt] char(8) NOT NULL, [itemCd] char(6) NOT NULL, [beCd] varchar(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [salPrice] float NULL, [salQty] float NULL, [salAmt] float NULL, [procStat] char(2) NULL, [serReqDt] char(8) NULL, [visitDt] char(8) NULL, [adviceDt] char(8) NULL, [adviceBeCd] varchar(6) NULL, [adviceEmp] varchar(8) NULL, [adviceMemo] varchar(500) NULL, [contDt] char(8) NULL, [contBeCd] varchar(6) NULL, [contEmp] varchar(8) NULL, [workDt] char(8) NULL, [workBeCd] varchar(6) NULL, [workEmp] varchar(8) NULL, [chargeDt] char(8) NULL, [deposit] float NULL, [workMemo] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Del_ReceiptMst]  PK: (없음)
CREATE TABLE [dbo].[Del_ReceiptMst] ([recNum] char(12) NOT NULL, [recDat] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [Stat] char(2) NOT NULL, [sumAmt] float NULL, [recTel1] varchar(20) NULL, [recTel2] varchar(20) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [recPath] char(2) NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Del_ReceiptStat]  PK: (없음)
CREATE TABLE [dbo].[Del_ReceiptStat] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [logDt] datetime NULL);

-- [dbo.Del_WorkSch]  PK: (없음)
CREATE TABLE [dbo].[Del_WorkSch] ([workNo] char(12) NOT NULL, [workDiv] char(2) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [workDt] char(8) NOT NULL, [workFrTim] char(4) NOT NULL, [workToTim] char(4) NOT NULL, [workDesc] varchar(500) NOT NULL, [RefNum] varchar(50) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Deposit]  PK: depoNo
CREATE TABLE [dbo].[Deposit] ([depoNo] char(10) NOT NULL, [memID] char(10) NOT NULL, [depoDt] char(8) NOT NULL, [depoDiv] char(2) NOT NULL, [RefNum] varchar(30) NULL, [payDiv] char(2) NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [inpAmt] float NULL, [remark] varchar(200) NULL, [statNo] char(10) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EContract]  PK: EContNo
CREATE TABLE [dbo].[EContract] ([EContNo] char(12) NOT NULL, [beCd] char(6) NOT NULL, [contType] char(2) NOT NULL, [SContDt] char(8) NOT NULL, [EContDt] char(8) NOT NULL, [EContEmpCd] varchar(8) NOT NULL, [extraPayRat] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EduMat]  PK: eduMatCd
CREATE TABLE [dbo].[EduMat] ([eduMatCd] char(5) NOT NULL, [eduMatNm] varchar(40) NOT NULL, [standard] varchar(40) NULL, [inPrice] float NULL, [outPrice] float NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EduMatCal]  PK: calNum
CREATE TABLE [dbo].[EduMatCal] ([calNum] char(10) NOT NULL, [calDat] char(8) NULL, [opSubjcd] char(10) NOT NULL, [eduMatCd] char(5) NOT NULL, [qty] float NULL, [price] float NULL, [amount] float NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EduMng]  PK: beCd, yearMonth
CREATE TABLE [dbo].[EduMng] ([beCd] char(6) NOT NULL, [yearMonth] char(6) NOT NULL, [eduAmt] float NULL, [remark] varchar(300) NULL, [closeYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ElectContract]  PK: contNo
CREATE TABLE [dbo].[ElectContract] ([contNo] varchar(12) NOT NULL, [regDat] varchar(8) NOT NULL, [regTim] varchar(6) NOT NULL, [regEmp] varchar(20) NULL);

-- [dbo.emp_upload]  PK: (없음)
CREATE TABLE [dbo].[emp_upload] ([empCod] nvarchar(255) NULL, [empNm] nvarchar(255) NULL, [loginID] nvarchar(255) NULL, [Pwd] nvarchar(255) NULL, [beCd] nvarchar(255) NULL, [phone] nvarchar(255) NULL, [hp] nvarchar(255) NULL, [birthDiv] float NULL, [birthDt] nvarchar(255) NULL, [socialNo] nvarchar(255) NULL, [startDt] nvarchar(255) NULL, [endDt] nvarchar(255) NULL, [eMail] nvarchar(255) NULL, [hobby] nvarchar(255) NULL, [religion] nvarchar(255) NULL, [enterTyp] nvarchar(255) NULL, [bloodTyp] nvarchar(255) NULL, [zipCod] nvarchar(255) NULL, [addr1] nvarchar(255) NULL, [addr2] nvarchar(255) NULL, [posDiv] nvarchar(255) NULL, [etcInfo] nvarchar(255) NULL, [chargeYN] nvarchar(255) NULL, [useYN] nvarchar(255) NULL, [regDt] nvarchar(255) NULL, [regEmpCd] nvarchar(255) NULL, [modiDt] nvarchar(255) NULL, [modiEmpCd] nvarchar(255) NULL);

-- [dbo.emp_upload_2]  PK: (없음)
CREATE TABLE [dbo].[emp_upload_2] ([empcod] float NULL, [empnm] nvarchar(255) NULL, [becd] nvarchar(255) NULL, [hp] nvarchar(255) NULL, [userid] nvarchar(255) NULL, [F6] nvarchar(255) NULL);

-- [dbo.emp2]  PK: (없음)
CREATE TABLE [dbo].[emp2] ([접수자] nvarchar(255) NULL, [기사명] nvarchar(255) NULL);

-- [dbo.emp3]  PK: (없음)
CREATE TABLE [dbo].[emp3] ([col1] varchar(20) NULL, [col2] nvarchar(255) NULL, [col3] nvarchar(255) NULL, [col4] float NULL, [col5] nvarchar(255) NULL, [col6] nvarchar(255) NULL, [col7] nvarchar(255) NULL, [col8] float NULL, [col9] float NULL, [col10] float NULL, [col11] float NULL, [col12] float NULL, [col13] nvarchar(255) NULL, [col14] nvarchar(255) NULL, [col15] nvarchar(255) NULL, [col16] nvarchar(255) NULL, [col17] nvarchar(255) NULL, [col18] float NULL, [col19] nvarchar(255) NULL, [col20] nvarchar(255) NULL, [col21] nvarchar(255) NULL, [col22] nvarchar(255) NULL, [col23] nvarchar(255) NULL, [col24] nvarchar(255) NULL, [col25] float NULL, [col26] float NULL, [col27] float NULL, [col28] float NULL);

-- [dbo.emp6]  PK: (없음)
CREATE TABLE [dbo].[emp6] ([col1] char(8) NULL, [col2] nvarchar(255) NULL, [col3] nvarchar(255) NULL, [col4] float NULL, [col5] nvarchar(255) NULL, [col6] nvarchar(255) NULL, [col7] nvarchar(255) NULL, [col8] float NULL, [col9] float NULL, [col10] float NULL, [col11] float NULL, [col12] float NULL, [col13] nvarchar(255) NULL, [col14] nvarchar(255) NULL, [col15] nvarchar(255) NULL, [col16] nvarchar(255) NULL, [col17] nvarchar(255) NULL, [col18] float NULL, [col19] nvarchar(255) NULL, [col20] nvarchar(255) NULL, [col21] nvarchar(255) NULL, [col22] nvarchar(255) NULL, [col23] nvarchar(255) NULL, [col24] nvarchar(255) NULL, [col25] float NULL, [col26] float NULL, [col27] float NULL, [col28] float NULL);

-- [dbo.EmpBeCdHistory]  PK: empcod, seqnum
CREATE TABLE [dbo].[EmpBeCdHistory] ([empcod] varchar(8) NOT NULL, [seqnum] char(4) NOT NULL, [beCd] char(6) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Employee]  PK: empCod
CREATE TABLE [dbo].[Employee] ([empCod] char(8) NOT NULL, [empNm] varchar(30) NOT NULL, [loginID] varchar(20) NOT NULL, [Pwd] varchar(20) NOT NULL, [beCd] varchar(6) NOT NULL, [phone] varchar(20) NULL, [hp] varchar(20) NULL, [birthDiv] char(1) NULL, [birthDt] char(8) NULL, [socialNo] varchar(13) NULL, [startDt] char(8) NULL, [endDt] char(8) NULL, [eMail] varchar(80) NULL, [hobby] varchar(80) NULL, [religion] varchar(40) NULL, [enterTyp] char(2) NULL, [bloodTyp] char(1) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [posDiv] char(2) NULL, [etcInfo] varchar(500) NULL, [chargeYN] char(1) NULL, [useYN] char(1) NULL, [capsID] varchar(30) NULL, [gwPW] varchar(30) NULL, [msgId] varchar(30) NULL, [macYN] char(1) NULL, [empCalDiv] char(2) NULL, [tempCd] char(3) NULL, [sms] varchar(20) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Employee_20250422]  PK: (없음)
CREATE TABLE [dbo].[Employee_20250422] ([empCod] char(8) NOT NULL, [empNm] varchar(30) NOT NULL, [loginID] varchar(20) NOT NULL, [Pwd] varchar(20) NOT NULL, [beCd] varchar(6) NOT NULL, [phone] varchar(20) NULL, [hp] varchar(20) NULL, [birthDiv] char(1) NULL, [birthDt] char(8) NULL, [socialNo] varchar(13) NULL, [startDt] char(8) NULL, [endDt] char(8) NULL, [eMail] varchar(80) NULL, [hobby] varchar(80) NULL, [religion] varchar(40) NULL, [enterTyp] char(2) NULL, [bloodTyp] char(1) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [posDiv] char(2) NULL, [etcInfo] varchar(500) NULL, [chargeYN] char(1) NULL, [useYN] char(1) NULL, [capsID] varchar(30) NULL, [gwPW] varchar(30) NULL, [msgId] varchar(30) NULL, [macYN] char(1) NULL, [empCalDiv] char(2) NULL, [tempCd] char(3) NULL, [sms] varchar(20) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Employee_d]  PK: (없음)
CREATE TABLE [dbo].[Employee_d] ([empCod] char(8) NOT NULL, [empNm] varchar(30) NOT NULL, [loginID] varchar(20) NOT NULL, [Pwd] varchar(20) NOT NULL, [beCd] varchar(6) NOT NULL, [phone] varchar(20) NULL, [hp] varchar(20) NULL, [birthDiv] char(1) NULL, [birthDt] char(8) NULL, [socialNo] varchar(13) NULL, [startDt] char(8) NULL, [endDt] char(8) NULL, [eMail] varchar(80) NULL, [hobby] varchar(80) NULL, [religion] varchar(40) NULL, [enterTyp] char(2) NULL, [bloodTyp] char(1) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [posDiv] char(2) NULL, [etcInfo] varchar(500) NULL, [chargeYN] char(1) NULL, [useYN] char(1) NULL, [capsID] varchar(30) NULL, [gwPW] varchar(30) NULL, [msgId] varchar(30) NULL, [macYN] char(1) NULL, [empCalDiv] char(2) NULL, [tempCd] char(3) NULL, [sms] varchar(20) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.empRefSms]  PK: empCod, refNum
CREATE TABLE [dbo].[empRefSms] ([empCod] char(8) NOT NULL, [refNum] char(3) NOT NULL, [refName] varchar(30) NULL, [sms] varchar(20) NULL, [remark] varchar(100) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EqContDeposit]  PK: depositIdx
CREATE TABLE [dbo].[EqContDeposit] ([depositIdx] int NOT NULL, [depositDiv] varchar(2) NULL, [eqContNo] char(12) NOT NULL, [eqDeSeq] char(3) NOT NULL, [depositDt] char(8) NOT NULL, [depositNM] varchar(30) NULL, [deposit] float NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EqContMst]  PK: eqContNo
CREATE TABLE [dbo].[EqContMst] ([eqContNo] char(12) NOT NULL, [eqContDt] char(8) NOT NULL, [empCod] char(8) NOT NULL, [custCd] varchar(8) NOT NULL, [rentalDiv] varchar(2) NOT NULL, [rentalCust] varchar(30) NOT NULL, [model] varchar(20) NOT NULL, [mediCd] varchar(20) NOT NULL, [installDt] varchar(8) NOT NULL, [rentalStDt] varchar(8) NULL, [rental] float NULL, [rentalMonth] float NULL, [tatalAmt] float NULL, [itemAmt] float NULL, [procStat] varchar(1) NULL, [eqIoNum] char(12) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EqContRental]  PK: eqContNo, eqSeq
CREATE TABLE [dbo].[EqContRental] ([eqContNo] char(12) NOT NULL, [eqSeq] char(3) NOT NULL, [retalDt] char(8) NOT NULL, [mediCd] varchar(20) NOT NULL, [retalEmp] varchar(8) NOT NULL, [procDt] char(8) NOT NULL, [eqIoNum] char(12) NOT NULL, [procYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EqIoDet]  PK: eqIoNum, seqNum
CREATE TABLE [dbo].[EqIoDet] ([eqIoNum] char(12) NOT NULL, [seqNum] char(3) NOT NULL, [refDiv] char(2) NOT NULL, [refNum] varchar(30) NULL, [cpDiv] char(1) NOT NULL, [connet] varchar(20) NOT NULL, [freeDiv] char(1) NOT NULL, [equipCd] varchar(20) NOT NULL, [ioUnit] char(2) NOT NULL, [ioPrice] float NULL, [ioQty] float NULL, [ioAmt] float NULL, [salPrice] float NULL, [salAmt] float NULL, [enuriAmt] float NULL, [netAmt] float NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EqIoMst]  PK: eqIoNum
CREATE TABLE [dbo].[EqIoMst] ([eqIoNum] char(12) NOT NULL, [eqIoDat] char(8) NOT NULL, [ioGubn] char(1) NOT NULL, [ioKind] varchar(2) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EquiCustomer]  PK: EqCusCode
CREATE TABLE [dbo].[EquiCustomer] ([EqCusCode] varchar(8) NOT NULL, [EqCusName] varchar(30) NULL, [cusType] char(2) NULL, [ownName] varchar(20) NULL, [uptae] varchar(14) NULL, [jongMok] varchar(14) NULL, [busNo] varchar(10) NULL, [telNo] varchar(14) NULL, [hpNo] varchar(14) NULL, [eMail] varchar(100) NULL, [zipNo] char(6) NULL, [addr1] varchar(100) NULL, [addr2] varchar(100) NULL, [inCharge] varchar(30) NULL, [beCd] char(6) NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Equipment]  PK: equipCd
CREATE TABLE [dbo].[Equipment] ([equipCd] varchar(20) NOT NULL, [equipNm] varchar(50) NOT NULL, [equipDiv] char(2) NOT NULL, [equipType] char(2) NOT NULL, [amount] float NULL, [salPrice] float NULL, [manu] varchar(50) NULL, [itemStd] varchar(50) NULL, [useYN] char(1) NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.EventRecord]  PK: eventNo
CREATE TABLE [dbo].[EventRecord] ([eventNo] char(10) NOT NULL, [beCd] char(6) NOT NULL, [eventNm] varchar(50) NOT NULL, [eventDiv] char(2) NULL, [FromDt] char(8) NOT NULL, [ToDt] char(8) NOT NULL, [Remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.excelSms]  PK: (없음)
CREATE TABLE [dbo].[excelSms] ([고객코드] varchar(10) NULL, [name] varchar(20) NULL, [접수번호] varchar(20) NULL, [접수일] float NULL, [이사종류] nvarchar(255) NULL, [아아템코드] nvarchar(255) NULL, [CBM] float NULL, [견적자] nvarchar(255) NULL, [사원코드] float NULL, [총금액] float NULL, [전화번호] nvarchar(255) NULL, [계약사원] nvarchar(255) NULL, [사원코드1] float NULL, [계약상태] nvarchar(255) NULL, [상태코드] float NULL, [작업일] float NULL, [작업지] nvarchar(255) NULL, [소속코드] nvarchar(255) NULL, [이사전주소] nvarchar(255) NULL, [이사후주소] nvarchar(255) NULL);

-- [dbo.ExceptMac]  PK: MacAddr
CREATE TABLE [dbo].[ExceptMac] ([MacAddr] varchar(50) NOT NULL, [ExceptNo] char(5) NOT NULL, [RegDat] char(8) NOT NULL, [RegEmp] varchar(20) NOT NULL, [Remark] varchar(200) NULL);

-- [dbo.extraPayMng]  PK: extraPayNo
CREATE TABLE [dbo].[extraPayMng] ([extraPayNo] varchar(11) NOT NULL, [empCalDiv] char(2) NOT NULL, [extraPayDiv] char(2) NOT NULL, [FromAmt] float NULL, [ToAmt] float NULL, [div] char(1) NULL, [penaltyAmt] float NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.FAXNO]  PK: (없음)
CREATE TABLE [dbo].[FAXNO] ([MAXFAXNO] varchar(13) NULL);

-- [dbo.FaxSend]  PK: faxNo
CREATE TABLE [dbo].[FaxSend] ([faxNo] varchar(13) NOT NULL, [faxDt] char(8) NOT NULL, [empCod] varchar(8) NOT NULL, [FromFax] varchar(20) NOT NULL, [ToFax] varchar(20) NOT NULL, [refDiv] char(2) NULL, [refNum] varchar(40) NULL);

-- [dbo.FileDBInfo]  PK: fileNo
CREATE TABLE [dbo].[FileDBInfo] ([fileNo] char(12) NOT NULL, [fileDiv] char(2) NOT NULL, [RefNum] varchar(30) NOT NULL, [fileNm] varchar(50) NULL, [fileData] text NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.FileInfo]  PK: fileNo
CREATE TABLE [dbo].[FileInfo] ([fileNo] char(12) NOT NULL, [fileDiv] char(2) NOT NULL, [RefNum] varchar(30) NOT NULL, [filePath] varchar(200) NULL, [realNm] varchar(50) NULL, [fileNm] varchar(50) NULL, [ext] varchar(10) NULL, [regDt] char(8) NULL, [regTim] varchar(6) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [passWord] varchar(50) NULL);

-- [dbo.GA_BOARD]  PK: (없음)
CREATE TABLE [dbo].[GA_BOARD] ([idx] bigint NULL, [subject] varchar(255) NOT NULL, [contents] text NULL, [hit] int NULL, [code] varchar(50) NOT NULL, [wdate] datetime NULL, [name] varchar(100) NULL, [pass] varchar(50) NULL, [email] varchar(100) NULL, [wgroup] int NOT NULL, [wstep] int NOT NULL, [wloc] int NOT NULL, [user_id] varchar(50) NULL, [is_auth] varchar(3) NULL, [ip] varchar(30) NOT NULL, [pdate] varchar(250) NULL, [is_public] varchar(3) NOT NULL, [is_html] varchar(3) NOT NULL, [is_notice] varchar(3) NOT NULL, [movie_file] varchar(100) NULL, [movie_width] varchar(100) NULL, [movie_height] varchar(100) NULL);

-- [dbo.GA_BOARD_FILES]  PK: (없음)
CREATE TABLE [dbo].[GA_BOARD_FILES] ([bdfile_idx] bigint IDENTITY NOT NULL, [bdfile_bd_idx] bigint NOT NULL, [bdfile_name] varchar(255) NOT NULL, [bdfile_size] varchar(10) NOT NULL, [bdfile_width] varchar(10) NOT NULL, [bdfile_height] varchar(10) NOT NULL, [bdfile_path] varchar(255) NOT NULL, [bdfile_org_name] varchar(100) NOT NULL);

-- [dbo.GA_BOARD_REPLY]  PK: (없음)
CREATE TABLE [dbo].[GA_BOARD_REPLY] ([idx] bigint IDENTITY NOT NULL, [board_idx] int NOT NULL, [face_icon] varchar(2) NULL, [name] varchar(20) NOT NULL, [contents] text NOT NULL, [wdate] datetime NOT NULL, [user_id] varchar(20) NOT NULL, [code] varchar(20) NOT NULL, [pass] varchar(20) NULL);

-- [dbo.GA_ESTIMATE_SUM]  PK: (없음)
CREATE TABLE [dbo].[GA_ESTIMATE_SUM] ([est_times] int NULL, [est_date] varchar(10) NULL, [est_sum] int NULL, [wdate] datetime NULL);

-- [dbo.GA_GOODS]  PK: (없음)
CREATE TABLE [dbo].[GA_GOODS] ([idx] int NULL, [catecode1_idx] int NULL, [catecode2_idx] int NULL, [catecode3_idx] int NULL, [goods_name] varchar(255) NULL, [goods_cbm] float NULL, [goods_is_view] varchar(3) NULL, [userfile1] varchar(255) NULL, [userfile1_width] varchar(10) NULL, [userfile1_height] varchar(10) NULL, [userfile1_size] varchar(10) NULL, [wdate] datetime NULL);

-- [dbo.Hanbang]  PK: hanbangNo
CREATE TABLE [dbo].[Hanbang] ([hanbangNo] varchar(50) NOT NULL, [publicDiv] varchar(20) NULL, [statusCd] varchar(10) NULL, [propertyTypeCd] varchar(20) NULL, [tradeTypeCd] varchar(20) NULL, [area1Val] varchar(50) NULL, [area2Val] varchar(50) NULL, [area3Val] varchar(50) NULL, [regionNm] varchar(100) NULL, [addressJibun] varchar(50) NULL, [buildingNm] nvarchar(100) NULL, [dongNm] varchar(50) NULL, [hoNm] varchar(50) NULL, [floorInfo] varchar(20) NULL, [directionInfo] varchar(20) NULL, [salePrice] decimal(18,0) NULL, [depositAmt] decimal(18,0) NULL, [rentAmt] decimal(18,0) NULL, [loanAmt] decimal(18,0) NULL, [featureDesc] nvarchar(MAX) NULL, [detailDesc] nvarchar(MAX) NULL, [privateMemo] nvarchar(MAX) NULL, [sendDt] varchar(20) NULL, [regDt] varchar(20) NULL, [sellerPhone] varchar(100) NULL, [lessorMemo] nvarchar(MAX) NULL, [buyerCustNo] varchar(50) NULL, [buyerPhone] varchar(100) NULL, [lesseeMemo1] nvarchar(MAX) NULL, [lesseeMemo2] nvarchar(MAX) NULL);

-- [dbo.HappyCall]  PK: memID, recDat, happyDiv, happySeq
CREATE TABLE [dbo].[HappyCall] ([memID] char(10) NOT NULL, [recDat] char(8) NOT NULL, [happyDiv] char(2) NOT NULL, [happySeq] char(3) NOT NULL, [happyRec] char(2) NOT NULL, [happyAnswer] varchar(300) NULL, [HappyBigo] varchar(1000) NULL, [empCod] char(8) NULL, [recNum] char(12) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyCallAns]  PK: ansType, SeqNum
CREATE TABLE [dbo].[HappyCallAns] ([ansType] char(2) NOT NULL, [SeqNum] char(3) NOT NULL, [ansDesc] varchar(50) NULL, [grade] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyCallAsk]  PK: askDiv, seqNum
CREATE TABLE [dbo].[HappyCallAsk] ([askDiv] char(2) NOT NULL, [seqNum] char(3) NOT NULL, [SortNo] char(3) NULL, [askDesc] varchar(100) NULL, [Rat] float NULL, [calRat] float NULL, [ansType] char(2) NULL, [useYn] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyCallAsk_20170626]  PK: (없음)
CREATE TABLE [dbo].[HappyCallAsk_20170626] ([askDiv] char(2) NOT NULL, [seqNum] char(3) NOT NULL, [SortNo] char(3) NULL, [askDesc] varchar(100) NULL, [Rat] float NULL, [calRat] float NULL, [ansType] char(2) NULL, [useYn] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyCallDst]  PK: callNo, callSeq
CREATE TABLE [dbo].[HappyCallDst] ([callNo] char(12) NOT NULL, [callSeq] char(3) NOT NULL, [askNum] char(5) NOT NULL, [ansNum] char(5) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyCallMst]  PK: callNo
CREATE TABLE [dbo].[HappyCallMst] ([callNo] char(12) NOT NULL, [callDt] char(8) NOT NULL, [askDiv] char(2) NOT NULL, [beCd] char(6) NOT NULL, [empCod] char(8) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [memID] char(10) NOT NULL, [Remark] varchar(500) NULL, [rejectionYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyDetail]  PK: memID, recDat, recNum, recSeq, happyDiv, happySeq
CREATE TABLE [dbo].[HappyDetail] ([memID] char(10) NOT NULL, [recDat] char(8) NOT NULL, [recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [happyDiv] char(2) NOT NULL, [happySeq] char(3) NOT NULL, [happyRec] char(2) NOT NULL, [happyAnswer] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HappyRec]  PK: happyDiv, happySeq
CREATE TABLE [dbo].[HappyRec] ([happyDiv] char(2) NOT NULL, [happySeq] char(3) NOT NULL, [happyAns] char(2) NOT NULL, [happyRemark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HomeAndMove]  PK: idx
CREATE TABLE [dbo].[HomeAndMove] ([idx] int NOT NULL, [memNm] varchar(50) NOT NULL, [HP] varchar(20) NOT NULL, [PHONE] varchar(20) NOT NULL, [EMAIL] varchar(80) NULL, [serReqDt] varchar(8) NOT NULL, [fromZipCd] varchar(6) NOT NULL, [fromAddr1] varchar(80) NOT NULL, [fromAddr2] varchar(80) NOT NULL, [toZipCd] varchar(6) NOT NULL, [toAddr1] varchar(80) NOT NULL, [toAddr2] varchar(80) NOT NULL, [memo] varchar(1000) NULL, [items] varchar(MAX) NULL, [beCd] varchar(6) NULL, [empCod] varchar(8) NULL, [regEmp] varchar(8) NULL, [recPath] varchar(2) NULL, [pyung] float NULL, [RECNUM] varchar(12) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HomeAndMove_stat_Proc]  PK: idx
CREATE TABLE [dbo].[HomeAndMove_stat_Proc] ([idx] int IDENTITY NOT NULL, [recnum] varchar(12) NULL, [recseq] varchar(3) NULL, [FromStat] varchar(2) NULL, [toStat] varchar(2) NULL, [toBecd] varchar(6) NULL, [toEmp] varchar(8) NULL, [memo] varchar(500) NULL, [regEmp] varchar(8) NULL, [cdate] datetime NULL);

-- [dbo.HomeAndMove_toss]  PK: idx
CREATE TABLE [dbo].[HomeAndMove_toss] ([idx] int IDENTITY NOT NULL, [recnum] varchar(12) NULL, [recseq] varchar(3) NULL, [toBecd] varchar(6) NULL, [toEmp] varchar(8) NULL, [memo] varchar(500) NULL, [regEmp] varchar(8) NULL, [code] varchar(2) NULL, [cdate] datetime NULL);

-- [dbo.HomeAndMoveStat]  PK: recNum, recSeq
CREATE TABLE [dbo].[HomeAndMoveStat] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [homeAndMoveYN] varchar(2) NOT NULL, [otherCompYN] char(1) NOT NULL, [noOptAmt] float NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HouseCodiDet]  PK: codiNo, seqNum
CREATE TABLE [dbo].[HouseCodiDet] ([codiNo] char(10) NOT NULL, [seqNum] char(3) NOT NULL, [codiDt] char(8) NOT NULL, [timeCd] char(2) NOT NULL, [itemCd] char(6) NOT NULL, [empCod] varchar(8) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HouseCodiMst]  PK: codiNo
CREATE TABLE [dbo].[HouseCodiMst] ([codiNo] char(10) NOT NULL, [reqDate] char(8) NOT NULL, [reqTim] char(6) NULL, [memId] char(10) NOT NULL, [memNm] varchar(30) NOT NULL, [memHp] varchar(14) NOT NULL, [beCd] char(6) NOT NULL, [dong] varchar(50) NULL, [hosu] varchar(50) NULL, [stat] char(2) NULL, [empCod] varchar(20) NOT NULL, [contDt] char(8) NOT NULL, [sDate] char(8) NOT NULL, [eDate] char(8) NOT NULL, [itemcd] char(6) NULL, [houseEmp] varchar(20) NULL, [schDiv] char(1) NULL, [days] int NULL, [ReqWeek1] char(1) NULL, [ReqWeek2] char(1) NULL, [ReqWeek3] char(1) NULL, [ReqWeek4] char(1) NULL, [ReqWeek5] char(1) NULL, [ReqWeek6] char(1) NULL, [ReqWeek7] char(1) NULL, [mon] int NULL, [monDay] int NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HouseCodiSch]  PK: schNo
CREATE TABLE [dbo].[HouseCodiSch] ([schNo] int NOT NULL, [codiDt] char(8) NOT NULL, [codiNo] char(10) NULL, [itemCd] char(6) NOT NULL, [empCod] varchar(8) NOT NULL, [schStat] char(2) NOT NULL, [reserDt] char(8) NOT NULL, [reserTim] char(6) NOT NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.HouseCodiSchHis]  PK: hisNo
CREATE TABLE [dbo].[HouseCodiSchHis] ([hisNo] int NOT NULL, [schNo] int NOT NULL, [oldCodiDt] char(8) NOT NULL, [newCodiDt] char(8) NULL, [codiNo] char(10) NULL, [olditemCd] char(6) NOT NULL, [newItemCd] char(6) NULL, [empCod] varchar(8) NOT NULL, [schStat] char(2) NOT NULL, [reserDt] char(8) NOT NULL, [reserTim] char(6) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.IoDet]  PK: ioNum, seqNum
CREATE TABLE [dbo].[IoDet] ([ioNum] char(12) NOT NULL, [seqNum] char(3) NOT NULL, [refDiv] char(2) NOT NULL, [refNum] varchar(30) NULL, [cpDiv] char(1) NOT NULL, [connet] varchar(20) NOT NULL, [freeDiv] char(1) NOT NULL, [pItemCd] char(6) NOT NULL, [ioUnit] char(2) NOT NULL, [ioPrice] float NULL, [ioQty] float NULL, [ioAmt] float NULL, [salPrice] float NULL, [salAmt] float NULL, [tax] float NULL, [totAmt] float NULL, [enuriAmt] float NULL, [netAmt] float NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ioDEt_20150511]  PK: (없음)
CREATE TABLE [dbo].[ioDEt_20150511] ([ioNum] char(12) NOT NULL, [seqNum] char(3) NOT NULL, [refDiv] char(2) NOT NULL, [refNum] varchar(30) NULL, [cpDiv] char(1) NOT NULL, [connet] varchar(20) NOT NULL, [freeDiv] char(1) NOT NULL, [pItemCd] char(6) NOT NULL, [ioUnit] char(2) NOT NULL, [ioPrice] float NULL, [ioQty] float NULL, [ioAmt] float NULL, [salPrice] float NULL, [salAmt] float NULL, [tax] float NULL, [totAmt] float NULL, [enuriAmt] float NULL, [netAmt] float NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.IoMst]  PK: ioNum
CREATE TABLE [dbo].[IoMst] ([ioNum] char(12) NOT NULL, [ioDat] char(8) NOT NULL, [ioGubn] char(1) NOT NULL, [ioKind] char(1) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ioMst_20150511]  PK: (없음)
CREATE TABLE [dbo].[ioMst_20150511] ([ioNum] char(12) NOT NULL, [ioDat] char(8) NOT NULL, [ioGubn] char(1) NOT NULL, [ioKind] char(1) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Item]  PK: itemCd
CREATE TABLE [dbo].[Item] ([itemCd] char(6) NOT NULL, [itemNm] varchar(50) NOT NULL, [shItemNm] varchar(50) NULL, [beCd] varchar(6) NOT NULL, [withBeCd] varchar(6) NULL, [cateCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [baseQty] float NULL, [amount] float NULL, [salAmt] float NULL, [suppAmt] float NULL, [calDiv] char(3) NULL, [taxYN] char(1) NULL, [recType] char(2) NULL, [itemInfo] varchar(500) NULL, [imgFile] varchar(50) NULL, [branchYN] varchar(1) NULL, [endDt] char(8) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.item_20150310]  PK: (없음)
CREATE TABLE [dbo].[item_20150310] ([itemCd] char(6) NOT NULL, [itemNm] varchar(50) NOT NULL, [shItemNm] varchar(50) NULL, [beCd] varchar(6) NOT NULL, [withBeCd] varchar(6) NULL, [cateCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [baseQty] float NULL, [amount] float NULL, [salAmt] float NULL, [suppAmt] float NULL, [calDiv] char(3) NULL, [taxYN] char(1) NULL, [recType] char(2) NULL, [itemInfo] varchar(500) NULL, [imgFile] varchar(50) NULL, [endDt] char(8) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Item_back]  PK: (없음)
CREATE TABLE [dbo].[Item_back] ([itemCd] char(6) NOT NULL, [itemNm] varchar(50) NOT NULL, [beCd] varchar(6) NOT NULL, [withBeCd] varchar(6) NULL, [cateCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [baseQty] float NULL, [amount] float NULL, [salAmt] float NULL, [suppAmt] float NULL, [calDiv] char(3) NULL, [taxYN] char(1) NULL, [recType] char(2) NULL, [itemInfo] varchar(500) NULL, [imgFile] varchar(50) NULL, [endDt] char(8) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.item_upload]  PK: (없음)
CREATE TABLE [dbo].[item_upload] ([itemCd] nvarchar(255) NULL, [itemNm] nvarchar(255) NULL, [beCd] nvarchar(255) NULL, [withBeCd] nvarchar(255) NULL, [cateCd] nvarchar(255) NULL, [unit] float NULL, [price] float NULL, [baseQty] float NULL, [amount] float NULL, [salAmt] float NULL, [suppAmt] float NULL, [calDiv] nvarchar(255) NULL, [taxYN] nvarchar(255) NULL, [recType] float NULL, [itemInfo] nvarchar(255) NULL, [imgFile] nvarchar(255) NULL, [endDt] nvarchar(255) NULL, [regDt] nvarchar(255) NULL, [regEmpCd] nvarchar(255) NULL, [modiDt] nvarchar(255) NULL, [modiEmpCd] nvarchar(255) NULL);

-- [dbo.ItemCharge]  PK: itemCd, seqNum
CREATE TABLE [dbo].[ItemCharge] ([itemCd] char(6) NOT NULL, [seqNum] char(3) NOT NULL, [fromBeCd] varchar(6) NOT NULL, [toBeCd] varchar(6) NOT NULL, [stDt] char(8) NOT NULL, [edDt] char(8) NOT NULL, [chTypeCd] char(2) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.JoinAmtMng]  PK: beCd, yearMonth
CREATE TABLE [dbo].[JoinAmtMng] ([beCd] char(6) NOT NULL, [yearMonth] char(6) NOT NULL, [turnNo] char(2) NOT NULL, [joinAmt] float NULL, [remark] varchar(300) NULL, [closeYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.KakaoRestriction]  PK: restNo
CREATE TABLE [dbo].[KakaoRestriction] ([restNo] int NOT NULL, [recNum] varchar(12) NOT NULL, [MSGNO] varchar(50) NOT NULL, [regDt] smalldatetime NULL);

-- [dbo.KakaoRestrictionCancel]  PK: restCanNo
CREATE TABLE [dbo].[KakaoRestrictionCancel] ([restCanNo] int NOT NULL, [recNum] varchar(12) NOT NULL, [MSGNO] varchar(50) NOT NULL, [regDt] smalldatetime NULL);

-- [dbo.label_addr]  PK: (없음)
CREATE TABLE [dbo].[label_addr] ([toAddr] nvarchar(255) NULL);

-- [dbo.label_addr_20250507]  PK: (없음)
CREATE TABLE [dbo].[label_addr_20250507] ([toAddr] nvarchar(255) NULL);

-- [dbo.LandRequests]  PK: landRecNum
CREATE TABLE [dbo].[LandRequests] ([landRecNum] varchar(20) NOT NULL, [reqDate] varchar(8) NULL, [clientType] varchar(10) NOT NULL, [dealType] varchar(10) NOT NULL, [memId] varchar(20) NOT NULL, [memName] varchar(50) NOT NULL, [memPhone] varchar(20) NULL, [memEmail] varchar(100) NULL, [sido] varchar(50) NULL, [gugun] varchar(50) NULL, [dong] varchar(50) NULL, [jibun] varchar(50) NULL, [roadAddr] varchar(50) NULL, [detailAddr] varchar(255) NULL, [landType] varchar(20) NULL, [hopeSalePrice] bigint NULL, [hopeDeposit] bigint NULL, [hopeMonRent] bigint NULL, [hopeManageFee] bigint NULL, [currDeposit] bigint NULL, [currMonRent] bigint NULL, [currManageFee] bigint NULL, [budSaleMin] bigint NULL, [budSaleMax] bigint NULL, [budDepositMin] bigint NULL, [budDepositMax] bigint NULL, [budRentMin] bigint NULL, [budRentMax] bigint NULL, [budManageMin] bigint NULL, [budManageMax] bigint NULL, [etcReq] varchar(MAX) NULL, [apiKey] varchar(50) NULL, [createdAt] datetime NULL);

-- [dbo.Lecturer]  PK: LectCd
CREATE TABLE [dbo].[Lecturer] ([LectCd] char(5) NOT NULL, [empCod] varchar(8) NOT NULL, [remark] varchar(500) NOT NULL, [UseYn] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.LivingWorker]  PK: recNum, recSeq, workIdx
CREATE TABLE [dbo].[LivingWorker] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [workIdx] char(5) NOT NULL, [workTim] int NULL, [workPay] int NULL, [remark] varchar(300) NULL, [reqMemo] varchar(300) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.LogInfo]  PK: LogNum
CREATE TABLE [dbo].[LogInfo] ([LogNum] char(12) NOT NULL, [LogDat] char(8) NOT NULL, [LogTim] char(6) NOT NULL, [EmpID] varchar(20) NOT NULL, [MacAddr] varchar(50) NOT NULL, [PcName] varchar(50) NOT NULL, [IP] varchar(30) NOT NULL);

-- [dbo.lunar2solar]  PK: num
CREATE TABLE [dbo].[lunar2solar] ([num] int IDENTITY NOT NULL, [lunar_date] datetime NOT NULL, [solar_date] datetime NOT NULL, [yun] bit NOT NULL, [ganji] char(5) NOT NULL);

-- [dbo.MacAddressMng]  PK: empCod, SeqNum
CREATE TABLE [dbo].[MacAddressMng] ([empCod] varchar(20) NOT NULL, [SeqNum] char(3) NOT NULL, [MacAddr] varchar(50) NOT NULL, [PcName] varchar(50) NOT NULL, [RegDat] char(8) NULL, [RegTim] char(6) NULL, [ModiDat] char(8) NULL, [ModiTim] char(6) NULL, [UseYn] char(1) NULL, [DelFlag] char(1) NULL);

-- [dbo.MacAddressMng_20260611]  PK: (없음)
CREATE TABLE [dbo].[MacAddressMng_20260611] ([empCod] varchar(20) NOT NULL, [SeqNum] char(3) NOT NULL, [MacAddr] varchar(50) NOT NULL, [PcName] varchar(50) NOT NULL, [RegDat] char(8) NULL, [RegTim] char(6) NULL, [ModiDat] char(8) NULL, [ModiTim] char(6) NULL, [UseYn] char(1) NULL, [DelFlag] char(1) NULL);

-- [dbo.Magazine]  PK: magaIdx
CREATE TABLE [dbo].[Magazine] ([magaIdx] int NOT NULL, [div] char(1) NULL, [recnum] char(12) NULL, [recseq] char(3) NULL, [beCd] varchar(6) NOT NULL, [EmpCd] varchar(8) NULL, [magaDt] char(8) NULL, [memID] varchar(30) NOT NULL, [phone] varchar(20) NULL, [hphone] varchar(20) NULL, [chargePerson] varchar(40) NULL, [email] varchar(40) NULL, [zipCod] varchar(6) NULL, [addr] varchar(100) NULL, [remark] varchar(100) NULL, [regIp] varchar(30) NULL);

-- [dbo.MarketKeyWord]  PK: mIdx
CREATE TABLE [dbo].[MarketKeyWord] ([mIdx] char(12) NOT NULL, [mDate] char(8) NOT NULL, [keyType] char(4) NOT NULL, [keyWord] varchar(50) NOT NULL, [keySdate] char(8) NULL, [keyEdate] char(8) NULL, [Memo] varchar(500) NULL, [totalCnt] int NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.MarketMember]  PK: mUserId
CREATE TABLE [dbo].[MarketMember] ([mUserId] varchar(20) NOT NULL, [hphone] varchar(20) NULL, [email] varchar(80) NULL, [regDt] smalldatetime NULL);

-- [dbo.MarketRel]  PK: mIdx, mUserId
CREATE TABLE [dbo].[MarketRel] ([mIdx] char(12) NOT NULL, [mUserId] varchar(20) NOT NULL, [keyWord] varchar(100) NULL);

-- [dbo.Member]  PK: memID
CREATE TABLE [dbo].[Member] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(500) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [snsType] char(1) NULL, [snsId] varchar(100) NULL, [push_token] varchar(500) NULL, [push] char(1) NULL, [lifetimeNo] varchar(30) NULL, [cidhp] varchar(20) NULL);

-- [dbo.member_120426]  PK: (없음)
CREATE TABLE [dbo].[member_120426] ([memID] char(10) NOT NULL, [memNm] varchar(30) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(30) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Member_20200325]  PK: (없음)
CREATE TABLE [dbo].[Member_20200325] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(30) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [snsType] char(1) NULL, [snsId] varchar(100) NULL, [push_token] varchar(500) NULL, [push] char(1) NULL, [lifetimeNo] varchar(30) NULL, [cidhp] varchar(20) NULL);

-- [dbo.Member_20240205]  PK: (없음)
CREATE TABLE [dbo].[Member_20240205] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(500) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [snsType] char(1) NULL, [snsId] varchar(100) NULL, [push_token] varchar(500) NULL, [push] char(1) NULL, [lifetimeNo] varchar(30) NULL, [cidhp] varchar(20) NULL);

-- [dbo.member_형태환]  PK: (없음)
CREATE TABLE [dbo].[member_형태환] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(500) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [snsType] char(1) NULL, [snsId] varchar(100) NULL, [push_token] varchar(500) NULL, [push] char(1) NULL, [lifetimeNo] varchar(30) NULL, [cidhp] varchar(20) NULL);

-- [dbo.member_delete]  PK: (없음)
CREATE TABLE [dbo].[member_delete] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(30) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.member_emp]  PK: (없음)
CREATE TABLE [dbo].[member_emp] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(500) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [snsType] char(1) NULL, [snsId] varchar(100) NULL, [push_token] varchar(500) NULL, [push] char(1) NULL, [lifetimeNo] varchar(30) NULL, [cidhp] varchar(20) NULL);

-- [dbo.Member_empCod]  PK: (없음)
CREATE TABLE [dbo].[Member_empCod] ([memID] char(10) NOT NULL, [memNm] varchar(50) NOT NULL, [sex] char(1) NOT NULL, [hPhone] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL, [memDiv] char(1) NOT NULL, [grade] char(2) NOT NULL, [stat] char(1) NULL, [socalNo] char(13) NULL, [eMail] varchar(80) NULL, [pyung] float NULL, [zipCod] char(6) NOT NULL, [addr1] varchar(80) NOT NULL, [addr2] varchar(80) NOT NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [userID] varchar(20) NULL, [userPw] varchar(20) NULL, [withBeCd] varchar(6) NULL, [withEmpcd] varchar(20) NULL, [memShip] char(2) NULL, [memShipCard] varchar(500) NULL, [pwAsk] char(2) NULL, [ansDesc] varchar(20) NULL, [remark] varchar(500) NULL, [smsYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [snsType] char(1) NULL, [snsId] varchar(100) NULL, [push_token] varchar(500) NULL, [push] char(1) NULL, [lifetimeNo] varchar(30) NULL, [cidhp] varchar(20) NULL);

-- [dbo.MEMBER_SECESSION]  PK: (없음)
CREATE TABLE [dbo].[MEMBER_SECESSION] ([IDX] int NULL, [ID] varchar(25) NULL, [PASSWD] varchar(25) NULL, [HPHONE] varchar(30) NULL, [NAME] varchar(25) NULL, [CONTENTS] text NULL, [WDATE] datetime NULL);

-- [dbo.member_upload]  PK: (없음)
CREATE TABLE [dbo].[member_upload] ([memID] nvarchar(255) NULL, [memNm] nvarchar(255) NULL, [sex] float NULL, [hPhone] nvarchar(255) NULL, [phone] nvarchar(255) NULL, [memDiv] float NULL, [grade] nvarchar(255) NULL, [stat] nvarchar(255) NULL, [socalNo] nvarchar(255) NULL, [eMail] nvarchar(255) NULL, [pyung] float NULL, [zipCod] float NULL, [addr1] nvarchar(255) NULL, [addr2] nvarchar(255) NULL, [userID] nvarchar(255) NULL, [userPw] nvarchar(255) NULL, [withBeCd] nvarchar(255) NULL, [withEmpcd] nvarchar(255) NULL, [memShip] nvarchar(255) NULL, [memShipCard] nvarchar(255) NULL, [pwAsk] nvarchar(255) NULL, [ansDesc] nvarchar(255) NULL, [remark] nvarchar(255) NULL, [regDt] nvarchar(255) NULL, [regEmpCd] nvarchar(255) NULL, [modiDt] nvarchar(255) NULL, [modiEmpCd] nvarchar(255) NULL);

-- [dbo.MemberAddInfo]  PK: memID
CREATE TABLE [dbo].[MemberAddInfo] ([memID] char(10) NOT NULL, [IDNO] varchar(20) NULL, [PerInCharge] varchar(40) NULL, [empCnt] varchar(40) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.milipass_Info]  PK: recNum
CREATE TABLE [dbo].[milipass_Info] ([recNum] varchar(12) NOT NULL, [orderNo] varchar(100) NULL, [movAmt] float NULL, [reqMsg] varchar(500) NULL, [CurDat] varchar(8) NULL, [CurTim] varchar(10) NULL, [fileUrl] varchar(200) NULL, [INSDATE] smalldatetime NULL, [UPDDATE] smalldatetime NULL);

-- [dbo.milipass_log]  PK: logNo
CREATE TABLE [dbo].[milipass_log] ([logNo] int NOT NULL, [recNum] varchar(12) NOT NULL, [curDt] varchar(8) NOT NULL, [curTim] varchar(10) NOT NULL, [orderNo] varchar(100) NULL, [movAmt] float NULL, [reqMsg] varchar(500) NULL, [INSDATE] smalldatetime NULL);

-- [dbo.MOBILE_MENU]  PK: menuid
CREATE TABLE [dbo].[MOBILE_MENU] ([menuid] varchar(30) NOT NULL, [menuNm] varchar(50) NULL);

-- [dbo.monPerTagetMng]  PK: TargetNo
CREATE TABLE [dbo].[monPerTagetMng] ([TargetNo] varchar(11) NOT NULL, [yearMonth] char(6) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [MTargetAmt] float NULL, [LTargetAmt] float NULL, [CTargetAmt] float NULL, [ITargetAmt] float NULL, [ETargetAmt] float NULL, [remark] varchar(400) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.MsgTemp]  PK: mTempNo
CREATE TABLE [dbo].[MsgTemp] ([mTempNo] char(3) NOT NULL, [typeCd] char(3) NOT NULL, [msgText] varchar(4000) NOT NULL, [useYn] char(1) NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [kakaoYN] char(1) NULL, [COPHDIV] varchar(20) NULL);

-- [dbo.MsgTemp_20260224]  PK: (없음)
CREATE TABLE [dbo].[MsgTemp_20260224] ([mTempNo] char(3) NOT NULL, [typeCd] char(3) NOT NULL, [msgText] varchar(4000) NOT NULL, [useYn] char(1) NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [kakaoYN] char(1) NULL, [COPHDIV] varchar(20) NULL);

-- [dbo.MVC_DATA]  PK: FILE_ID, FILE_VER, FILE_SEQ
CREATE TABLE [dbo].[MVC_DATA] ([FILE_ID] int NOT NULL, [FILE_VER] int NOT NULL, [FILE_SEQ] int NOT NULL, [FILE_DATA] varchar(4000) NULL);

-- [dbo.MVC_FILES]  PK: FILE_ID
CREATE TABLE [dbo].[MVC_FILES] ([FILE_ID] int NOT NULL, [FILE_NAME] varchar(100) NULL, [FILE_PATH] varchar(250) NULL, [FILE_TITLE] varchar(100) NULL, [FILE_VER] int NULL, [PROJECT_ID] varchar(20) NULL, [CHECK_ID] varchar(50) NULL, [CHECK_PATH] varchar(100) NULL, [FILE_TYPE] int NULL, [FILE_TICK] int NULL);

-- [dbo.MVC_PROJECTS]  PK: PROJECT_ID
CREATE TABLE [dbo].[MVC_PROJECTS] ([PROJECT_ID] varchar(20) NOT NULL, [PROJECT_NAME] varchar(50) NULL, [PROJECT_DESC] varchar(250) NULL);

-- [dbo.MVC_USERS]  PK: USER_ID
CREATE TABLE [dbo].[MVC_USERS] ([USER_ID] varchar(50) NOT NULL, [USER_PSWD] varchar(50) NULL, [USER_TYPE] int NULL);

-- [dbo.MVC_VERSIONS]  PK: FILE_ID, FILE_VER
CREATE TABLE [dbo].[MVC_VERSIONS] ([FILE_ID] int NOT NULL, [FILE_VER] int NOT NULL, [FILE_TIME] int NULL, [FILE_SIZE] int NULL, [FILE_DESC] varchar(250) NULL, [USER_ID] varchar(50) NULL);

-- [dbo.MyUniqueTable]  PK: (없음)
CREATE TABLE [dbo].[MyUniqueTable] ([UniqueColumn] uniqueidentifier NULL, [Characters] varchar(10) NULL);

-- [dbo.old_Tbl_moving]  PK: (없음)
CREATE TABLE [dbo].[old_Tbl_moving] ([REGNO] varchar(10) NOT NULL, [IREGNO] varchar(10) NOT NULL, [GUBUN] varchar(2) NOT NULL, [IDATE] varchar(10) NOT NULL, [GREGNO] varchar(20) NULL, [IYUH] varchar(5) NULL, [IROOT] varchar(5) NULL, [IID] varchar(20) NULL, [ISALE] varchar(20) NULL, [MCOUPON] varchar(20) NULL, [IACC] varchar(10) NULL, [MSAKIND] varchar(5) NULL, [IISA] varchar(10) NULL, [ZIP] varchar(7) NULL, [ADDRE1] varchar(100) NULL, [ADDRE2] varchar(100) NULL, [PY] numeric(18,0) NULL, [EREMARK] varchar(1000) NULL, [MSA2] varchar(5) NULL, [MJISA] varchar(10) NULL, [MIZIP] varchar(7) NULL, [MIADDRE1] varchar(100) NULL, [MIADDRE2] varchar(100) NULL, [IPY] numeric(18,0) NULL, [IATEL] varchar(20) NULL, [IBGUM] numeric(18,0) NULL, [BTEL] varchar(20) NULL, [BREMARK] varchar(1000) NULL, [MMUL] numeric(18,2) NULL, [MGUM] numeric(18,0) NULL, [MCBM] numeric(18,0) NULL, [MKM] numeric(18,0) NULL, [MOP] numeric(18,0) NULL, [MOPGUM] numeric(18,0) NULL, [MJOP] varchar(500) NULL, [MNOTI] varchar(500) NULL, [MNAE] varchar(500) NULL, [MYOGU] varchar(500) NULL, [MCOMPY] varchar(5) NULL, [MSABUN] varchar(20) NULL, [MCOMGUM] numeric(18,0) NULL, [MSAGUM] numeric(18,0) NULL, [MCHGU] varchar(7) NULL, [MCOMRE] varchar(500) NULL, [MBISA1] varchar(10) NULL, [MBISA2] varchar(10) NULL, [MBSIN] varchar(2) NULL, [MBDAY] varchar(3) NULL, [MBMUL] numeric(18,0) NULL, [MBGUM] numeric(18,0) NULL, [MBTEL] varchar(20) NULL, [MWO] varchar(3) NULL, [MWOS] int NULL, [MWOL] int NULL, [MWOGUM] numeric(18,0) NULL, [TOTAL] numeric(18,0) NULL, [GEYAK] numeric(18,0) NULL, [GDATE1] varchar(10) NULL, [GKIND1] varchar(2) NULL, [GCARD1] varchar(20) NULL, [GNAM] numeric(18,0) NULL, [GDATE2] varchar(10) NULL, [GKIND2] varchar(2) NULL, [GCARD2] varchar(20) NULL, [GEDATE] varchar(10) NULL, [OJISA] varchar(10) NULL, [OJIJUM] varchar(10) NULL, [TJISA] varchar(10) NULL, [TJIJUM] varchar(10) NULL, [TTEAM] varchar(10) NULL, [TSAWON] varchar(10) NULL, [STATUS1] varchar(2) NULL, [STATUS2] varchar(2) NULL, [BRETURN] varchar(500) NULL, [TJISA9] varchar(10) NULL, [TJIJUM9] varchar(10) NULL, [TTEAM9] varchar(10) NULL, [TSAWON9] varchar(10) NULL, [GEYAKJA] varchar(10) NULL, [GEJISA] varchar(10) NULL, [GEJIJUM] varchar(10) NULL, [JCOMPY] varchar(5) NULL, [MAGUM] numeric(18,0) NULL, [ENDDAT] varchar(10) NULL, [SJISA] varchar(5) NULL, [SJIJUM] varchar(5) NULL, [MGENUM1] varchar(30) NULL, [MGENUM2] varchar(30) NULL, [MGUBUN] varchar(2) NULL, [MDATE] varchar(10) NULL, [MSEQN] numeric(18,0) NULL, [family_count] varchar(50) NULL, [move_pay_20] varchar(1) NULL, [move_money_20] varchar(20) NULL, [move_tid_20] varchar(50) NULL, [move_date_20] varchar(50) NULL, [move_pay_80] varchar(1) NULL, [move_money_80] varchar(20) NULL, [move_tid_80] varchar(50) NULL, [move_date_80] varchar(50) NULL, [move_option] varchar(255) NULL, [is_acuscode] varchar(3) NULL, [acuscode] int NULL, [event_internet] varchar(3) NULL, [event_water] varchar(3) NULL, [is_delete] varchar(1) NULL, [MKMAMT] numeric(18,0) NULL, [MCITY] varchar(20) NULL, [MCIGU] varchar(30) NULL, [MCIDO] varchar(30) NULL, [MCIBN] varchar(2) NULL, [MCINM] varchar(40) NULL, [MCIADDR] varchar(100) NULL, [CITY] varchar(20) NULL, [CIGU] varchar(30) NULL, [CIDO] varchar(30) NULL, [CIBN] varchar(2) NULL, [CINM] varchar(40) NULL, [CIADDR] varchar(100) NULL, [MCIBUN] varchar(4) NULL, [MCIJI] varchar(4) NULL, [MCIDONG] varchar(4) NULL, [MCIHO] varchar(4) NULL, [CIBUN] varchar(4) NULL, [CIJI] varchar(4) NULL, [CIDONG] varchar(4) NULL, [CIHO] varchar(4) NULL, [MJGUM] numeric(18,0) NULL, [CARTON1] numeric(18,0) NULL, [CARTON2] numeric(18,0) NULL, [CARTON5] numeric(18,0) NULL, [MRATE] numeric(18,0) NULL, [MDCAMT] numeric(18,0) NULL, [MCOMPLET] varchar(500) NULL, [MCARAMT] numeric(18,0) NULL);

-- [dbo.OpenSubj]  PK: OpSubjcd
CREATE TABLE [dbo].[OpenSubj] ([OpSubjcd] char(10) NOT NULL, [SubjCd] char(6) NOT NULL, [OrganNo] char(5) NOT NULL, [StartDt] char(8) NULL, [EndDt] char(8) NULL, [Remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OrderDet]  PK: ordNum, ordSeq
CREATE TABLE [dbo].[OrderDet] ([ordNum] varchar(14) NOT NULL, [ordSeq] char(3) NOT NULL, [pItemCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [qty] float NULL, [price] float NULL, [amount] float NULL, [remark] varchar(300) NULL, [ordFullNo] varchar(18) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OrderMst]  PK: ordNum
CREATE TABLE [dbo].[OrderMst] ([ordNum] varchar(14) NOT NULL, [ordDat] char(8) NOT NULL, [cusCode] varchar(8) NULL, [ordEmp] varchar(10) NOT NULL, [delDat] char(8) NULL, [delArea] varchar(50) NULL, [remark] varchar(100) NULL, [stat] char(1) NULL, [ordAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OrganInfo]  PK: OrganNo
CREATE TABLE [dbo].[OrganInfo] ([OrganNo] char(5) NOT NULL, [OrganNm] varchar(30) NOT NULL, [BossNm] varchar(30) NOT NULL, [comNum] char(10) NULL, [Phone1] varchar(20) NULL, [Phone2] varchar(20) NULL, [zipCd] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [UseYn] char(1) NULL, [Remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OrganPerson]  PK: OrganNo, PerSeq
CREATE TABLE [dbo].[OrganPerson] ([OrganNo] char(5) NOT NULL, [PerSeq] char(3) NOT NULL, [PerNm] varchar(30) NOT NULL, [ChSubj] varchar(30) NULL, [Phone] varchar(20) NULL, [HPhone] varchar(20) NULL, [EMail] varchar(80) NULL, [FaxNo] varchar(15) NULL, [Remark] varchar(200) NULL, [UseYn] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OtherToss]  PK: otherTossNo
CREATE TABLE [dbo].[OtherToss] ([otherTossNo] int NOT NULL, [tossDt] char(8) NOT NULL, [tossCmp] char(5) NOT NULL, [tossMsg] varchar(500) NULL, [tossEmp] varchar(10) NOT NULL, [recnum] varchar(12) NOT NULL, [recSeq] varchar(3) NOT NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OutReqDet]  PK: reqNum, seqNum
CREATE TABLE [dbo].[OutReqDet] ([reqNum] char(12) NOT NULL, [seqNum] char(3) NOT NULL, [pItemCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [qty] float NULL, [freeDiv] char(1) NOT NULL, [remark] varchar(500) NULL, [reqFullNo] varchar(16) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.OutReqMst]  PK: reqNum
CREATE TABLE [dbo].[OutReqMst] ([reqNum] char(12) NOT NULL, [reqDat] char(8) NULL, [beCd] varchar(6) NULL, [empCod] char(8) NULL, [reqStat] char(1) NULL, [remark] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.PackageItemDet]  PK: packageCd, seqNum
CREATE TABLE [dbo].[PackageItemDet] ([packageCd] varchar(6) NOT NULL, [seqNum] char(3) NOT NULL, [itemCd] varchar(6) NOT NULL, [qty] float NOT NULL, [remark] varchar(200) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.PackageItemMst]  PK: packageCd
CREATE TABLE [dbo].[PackageItemMst] ([packageCd] varchar(6) NOT NULL, [packageNM] varchar(50) NOT NULL, [packDiv] char(2) NULL, [defaultRecType] char(2) NULL, [remark] varchar(200) NOT NULL, [UseYN] char(1) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.pangolin_test_table]  PK: (없음)
CREATE TABLE [dbo].[pangolin_test_table] ([id] int IDENTITY NOT NULL, [name] nvarchar(300) NOT NULL, [depth] int NOT NULL, [isfile] nvarchar(50) NULL);

-- [dbo.PhoneAuth]  PK: hPhone
CREATE TABLE [dbo].[PhoneAuth] ([hPhone] varchar(20) NOT NULL, [authNo] varchar(10) NULL, [authYN] char(1) NULL, [regDate] smalldatetime NULL);

-- [dbo.ProcLog]  PK: logIdx
CREATE TABLE [dbo].[ProcLog] ([logIdx] int NOT NULL, [progId] varchar(30) NOT NULL, [regDt] char(8) NOT NULL, [regTim] char(6) NOT NULL, [regEmpCd] varchar(8) NULL, [regIp] varchar(30) NULL);

-- [dbo.PurchaseItem]  PK: pItemCd
CREATE TABLE [dbo].[PurchaseItem] ([pItemCd] char(6) NOT NULL, [pItemNm] varchar(30) NULL, [pMngbeCd] char(6) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [amount] float NULL, [salPrice] float NULL, [safeQty] float NULL, [manu] varchar(50) NULL, [itemStd] varchar(50) NULL, [TaxYN] char(1) NULL, [useYN] char(1) NULL, [remark] varchar(100) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReceiptAddInfo]  PK: recNum
CREATE TABLE [dbo].[ReceiptAddInfo] ([recNum] char(12) NOT NULL, [CardNo] varchar(500) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReceiptDet]  PK: recNum, recSeq
CREATE TABLE [dbo].[ReceiptDet] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [iRecDt] char(8) NOT NULL, [itemCd] char(6) NOT NULL, [beCd] varchar(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [salPrice] float NULL, [salQty] float NULL, [salAmt] float NULL, [procStat] char(2) NULL, [serReqDt] char(8) NULL, [visitDt] char(8) NULL, [adviceDt] char(8) NULL, [adviceBeCd] varchar(6) NULL, [adviceEmp] varchar(8) NULL, [adviceMemo] varchar(500) NULL, [branchYN] char(1) NULL, [contDt] char(8) NULL, [contBeCd] varchar(6) NULL, [contEmp] varchar(8) NULL, [workDt] char(8) NULL, [workBeCd] varchar(6) NULL, [workEmp] varchar(8) NULL, [chargeDt] char(8) NULL, [deposit] float NULL, [workMemo] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReceiptDet_backup]  PK: (없음)
CREATE TABLE [dbo].[ReceiptDet_backup] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [iRecDt] char(8) NOT NULL, [itemCd] char(6) NOT NULL, [beCd] varchar(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [salPrice] float NULL, [salQty] float NULL, [salAmt] float NULL, [procStat] char(2) NULL, [serReqDt] char(8) NULL, [visitDt] char(8) NULL, [adviceDt] char(8) NULL, [adviceBeCd] varchar(6) NULL, [adviceEmp] varchar(8) NULL, [adviceMemo] varchar(500) NULL, [branchYN] char(1) NULL, [contDt] char(8) NULL, [contBeCd] varchar(6) NULL, [contEmp] varchar(8) NULL, [workDt] char(8) NULL, [workBeCd] varchar(6) NULL, [workEmp] varchar(8) NULL, [chargeDt] char(8) NULL, [deposit] float NULL, [workMemo] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReceiptDet_R20230201533]  PK: (없음)
CREATE TABLE [dbo].[ReceiptDet_R20230201533] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [iRecDt] char(8) NOT NULL, [itemCd] char(6) NOT NULL, [beCd] varchar(6) NOT NULL, [recType] char(2) NOT NULL, [unit] char(2) NOT NULL, [price] float NULL, [qty] float NULL, [amt] float NULL, [salPrice] float NULL, [salQty] float NULL, [salAmt] float NULL, [procStat] char(2) NULL, [serReqDt] char(8) NULL, [visitDt] char(8) NULL, [adviceDt] char(8) NULL, [adviceBeCd] varchar(6) NULL, [adviceEmp] varchar(8) NULL, [adviceMemo] varchar(500) NULL, [branchYN] char(1) NULL, [contDt] char(8) NULL, [contBeCd] varchar(6) NULL, [contEmp] varchar(8) NULL, [workDt] char(8) NULL, [workBeCd] varchar(6) NULL, [workEmp] varchar(8) NULL, [chargeDt] char(8) NULL, [deposit] float NULL, [workMemo] varchar(500) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReceiptLog]  PK: logNo
CREATE TABLE [dbo].[ReceiptLog] ([logNo] char(12) NOT NULL, [logDat] char(8) NOT NULL, [logTim] char(6) NOT NULL, [recNum] char(12) NOT NULL, [progId] varchar(20) NOT NULL, [logEmp] varchar(8) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL);

-- [dbo.ReceiptMemo]  PK: recNum, memoSeq
CREATE TABLE [dbo].[ReceiptMemo] ([recNum] char(12) NOT NULL, [memoSeq] char(3) NOT NULL, [memoDt] char(8) NOT NULL, [memo] varchar(MAX) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReceiptMobile]  PK: recNum
CREATE TABLE [dbo].[ReceiptMobile] ([recNum] char(12) NOT NULL, [TYPE] char(1) NULL, [wardrobe_assembly] char(1) NULL, [aircon_remove] char(1) NULL, [aircon_add] char(1) NULL, [washing] char(1) NULL, [stone_bed] char(1) NULL, [homecare] char(1) NULL, [in_clean] char(1) NULL, [re_clean] char(1) NULL, [sterilize] char(1) NULL, [mattress] char(1) NULL, [storage] char(1) NULL, [storageTime] char(1) NULL, [laundry] char(1) NULL, [s_ladder] char(1) NULL, [e_ladder] char(1) NULL, [company_name] varchar(50) NULL, [employees_num] varchar(50) NULL, [manager] varchar(50) NULL, [phone] varchar(50) NULL, [cellphone] varchar(50) NULL, [email] varchar(50) NULL, [city] varchar(10) NULL, [N_address] varchar(100) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [callUrl] varchar(100) NULL);

-- [dbo.ReceiptMst]  PK: recNum
CREATE TABLE [dbo].[ReceiptMst] ([recNum] char(12) NOT NULL, [recDat] char(8) NOT NULL, [memID] char(10) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [Stat] char(2) NOT NULL, [sumAmt] float NULL, [recTel1] varchar(20) NULL, [recTel2] varchar(20) NULL, [zipCod] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [recPath] char(2) NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [expTossAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [recTim] char(6) NULL, [branchContNo] varchar(30) NULL, [apiLogId] int NULL);

-- [dbo.ReceiptStat]  PK: recNum, recSeq, seqNum
CREATE TABLE [dbo].[ReceiptStat] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [logDt] datetime NULL);

-- [dbo.ReceiptStat_20210621]  PK: (없음)
CREATE TABLE [dbo].[ReceiptStat_20210621] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [logDt] datetime NULL);

-- [dbo.ReceiptStat_backup]  PK: (없음)
CREATE TABLE [dbo].[ReceiptStat_backup] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [logDt] datetime NULL);

-- [dbo.ReceiptStat_R20230201533]  PK: (없음)
CREATE TABLE [dbo].[ReceiptStat_R20230201533] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [logDt] datetime NULL);

-- [dbo.ReciptType01]  PK: recNum, recSeq
CREATE TABLE [dbo].[ReciptType01] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [salEmp] varchar(8) NULL, [couponNo] varchar(20) NULL, [distance] float NULL, [movingDt] char(8) NULL, [stNatCd] char(2) NULL, [edNatCd] char(2) NULL, [estAmt] float NULL, [estOPtAmt] float NULL, [baseAddr] char(1) NULL, [frZipCd] char(6) NULL, [frPyung] varchar(10) NULL, [frPhone] varchar(20) NULL, [frAddr1] varchar(80) NULL, [frAddr2] varchar(80) NULL, [frLatitude] varchar(30) NULL, [frLongitude] varchar(30) NULL, [frRemark] varchar(500) NULL, [toZipCd] char(6) NULL, [toPyung] varchar(10) NULL, [toPhone] varchar(20) NULL, [toAddr1] varchar(80) NULL, [toAddr2] varchar(80) NULL, [toLatitude] varchar(30) NULL, [toLongitude] varchar(30) NULL, [toRemark] varchar(500) NULL, [memo] varchar(1000) NULL, [ton5] float NULL, [ton2_5] float NULL, [ton1] float NULL, [etc] varchar(50) NULL, [cbm] float NULL, [rqestMovAmt] float NULL, [rqestOptAmt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [AREACD] char(2) NULL, [PkgDat] char(8) NULL, [KeepSDT] char(8) NULL, [KeepEDT] char(8) NULL);

-- [dbo.ReciptType02]  PK: recNum, recSeq
CREATE TABLE [dbo].[ReciptType02] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [salEmp] varchar(8) NULL, [couponNo] varchar(20) NULL, [reqTim] char(4) NULL, [livingTyp] char(2) NULL, [estAmt] float NULL, [baseAddr] char(1) NULL, [zipCd] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [memo] varchar(1000) NULL, [pyung] float NULL, [buildTyp] char(2) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [workEmpNM] varchar(30) NULL, [reqBelong] varchar(50) NULL, [billWay] char(2) NULL, [contYN] char(1) NULL, [calAmt] float NULL);

-- [dbo.ReciptType03]  PK: recNum, recSeq
CREATE TABLE [dbo].[ReciptType03] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [salEmp] varchar(8) NULL, [payDt] varchar(20) NULL, [stDt] char(8) NULL, [edDt] char(8) NULL, [reqTim] varchar(20) NULL, [reqWeek1] char(1) NULL, [reqWeek2] char(1) NULL, [reqWeek3] char(1) NULL, [reqWeek4] char(1) NULL, [reqWeek5] char(1) NULL, [reqWeek6] char(1) NULL, [reqWeek7] char(1) NULL, [serDesc] varchar(50) NULL, [couponNo] varchar(20) NULL, [chdName1] varchar(20) NULL, [chdGub1] char(1) NULL, [chdAge1] float NULL, [chdName2] varchar(20) NULL, [chdGub2] char(1) NULL, [chdAge2] float NULL, [pyung] float NULL, [famCnt] float NULL, [estAmt] float NULL, [subway] varchar(30) NULL, [subwayOutNo] varchar(20) NULL, [parentGoTm] varchar(20) NULL, [parentOutTm] varchar(20) NULL, [baseAddr] char(1) NULL, [zipCd] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [latitude] varchar(30) NULL, [longitude] varchar(30) NULL, [mapDesc] varchar(500) NULL, [memo] varchar(1000) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReciptType04]  PK: recNum, recSeq
CREATE TABLE [dbo].[ReciptType04] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [couponNo] varchar(20) NULL, [buildDt] char(8) NULL, [livingTyp] char(2) NULL, [buildTyp] char(2) NULL, [pyung] float NULL, [estAmt] float NULL, [baseAddr] char(1) NULL, [zipCd] char(6) NULL, [addr1] varchar(80) NULL, [addr2] varchar(80) NULL, [Latitude] varchar(30) NULL, [Longitude] varchar(30) NULL, [memo] varchar(1000) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ReciptType99]  PK: recNum, recSeq
CREATE TABLE [dbo].[ReciptType99] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [salEmp] varchar(8) NULL, [couponNo] varchar(20) NULL, [estAmt] float NULL, [baseAddr] char(1) NULL, [frZipCd] char(6) NULL, [frPyung] float NULL, [frPhone] varchar(20) NULL, [frAddr1] varchar(80) NULL, [frAddr2] varchar(80) NULL, [frLatitude] varchar(30) NULL, [frLongitude] varchar(30) NULL, [frRemark] varchar(500) NULL, [toZipCd] char(6) NULL, [toPyung] float NULL, [toPhone] varchar(20) NULL, [toAddr1] varchar(80) NULL, [toAddr2] varchar(80) NULL, [toLatitude] varchar(30) NULL, [toLongitude] varchar(30) NULL, [toRemark] varchar(500) NULL, [memo] varchar(1000) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.RecPathItem]  PK: recPath, seqNum
CREATE TABLE [dbo].[RecPathItem] ([recPath] char(2) NOT NULL, [seqNum] char(3) NOT NULL, [itemCd] char(6) NOT NULL, [itemNm] varchar(50) NOT NULL, [useYN] char(1) NULL, [remark] varchar(200) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.Redirect]  PK: randUrl
CREATE TABLE [dbo].[Redirect] ([randUrl] varchar(50) NOT NULL, [RedirectUrl] varchar(100) NULL);

-- [dbo.RegSubjInfo]  PK: opSubjcd, empCod
CREATE TABLE [dbo].[RegSubjInfo] ([opSubjcd] char(10) NOT NULL, [empCod] char(8) NOT NULL, [stat] char(1) NOT NULL, [tempStat] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.RelMemBe]  PK: memID, seqNum
CREATE TABLE [dbo].[RelMemBe] ([memID] char(10) NOT NULL, [seqNum] char(3) NOT NULL, [beCd] varchar(6) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.reqData_20251022]  PK: (없음)
CREATE TABLE [dbo].[reqData_20251022] ([serReqDt] char(8) NULL, [visitDt] char(8) NULL, [memNm] varchar(50) NOT NULL, [frZipCd] char(6) NULL, [frSido] varchar(20) NULL, [frGubun] varchar(20) NULL, [frRoadName] nvarchar(100) NULL, [frAddr] varchar(161) NULL, [toZipCd] char(6) NULL, [toSido] varchar(20) NULL, [toGubun] varchar(20) NULL, [toRoadName] nvarchar(100) NULL, [toAddr] varchar(161) NULL);

-- [dbo.reqData_20251022_1]  PK: (없음)
CREATE TABLE [dbo].[reqData_20251022_1] ([serReqDt] char(8) NULL, [visitDt] char(8) NULL, [memNm] varchar(50) NOT NULL, [recNum] char(12) NOT NULL, [recTel1] varchar(20) NULL, [recTel2] varchar(20) NULL, [frZipCd] char(6) NULL, [frSido] varchar(20) NULL, [frGubun] varchar(20) NULL, [frRoadName] nvarchar(100) NULL, [frAddr] varchar(161) NULL, [toZipCd] char(6) NULL, [toSido] varchar(20) NULL, [toGubun] varchar(20) NULL, [toRoadName] nvarchar(100) NULL, [toAddr] varchar(161) NULL);

-- [dbo.reqData_20251023_1]  PK: (없음)
CREATE TABLE [dbo].[reqData_20251023_1] ([serReqDt] char(8) NULL, [visitDt] char(8) NULL, [recNum] char(12) NOT NULL, [recTel1] varchar(20) NULL, [memNm] varchar(50) NOT NULL, [frZipCd] char(6) NULL, [frSido] varchar(20) NULL, [frGubun] varchar(20) NULL, [frRoadName] nvarchar(100) NULL, [frAddr] varchar(161) NULL, [toZipCd] char(6) NULL, [toSido] varchar(20) NULL, [toGubun] varchar(20) NULL, [toRoadName] nvarchar(100) NULL, [toAddr] varchar(161) NULL);

-- [dbo.reqData_20251023_2]  PK: (없음)
CREATE TABLE [dbo].[reqData_20251023_2] ([serReqDt] char(8) NULL, [visitDt] char(8) NULL, [recNum] char(12) NOT NULL, [recTel1] varchar(20) NULL, [memNm] varchar(50) NOT NULL, [frZipCd] char(6) NULL, [frSido] varchar(20) NULL, [frGubun] varchar(20) NULL, [frRoadName] nvarchar(100) NULL, [frAddr] varchar(161) NULL, [toZipCd] char(6) NULL, [toSido] varchar(20) NULL, [toGubun] varchar(20) NULL, [toRoadName] nvarchar(100) NULL, [toAddr] varchar(161) NULL);

-- [dbo.reqData_20260210]  PK: (없음)
CREATE TABLE [dbo].[reqData_20260210] ([serReqDt] char(8) NULL, [visitDt] char(8) NULL, [memNm] varchar(50) NOT NULL, [frZipCd] char(6) NULL, [frSido] varchar(20) NULL, [frGubun] varchar(20) NULL, [frRoadName] nvarchar(100) NULL, [frAddr] varchar(161) NULL, [toZipCd] char(6) NULL, [toSido] varchar(20) NULL, [toGubun] varchar(20) NULL, [toRoadName] nvarchar(100) NULL, [toAddr] varchar(161) NULL);

-- [dbo.rndNumber]  PK: (없음)
CREATE TABLE [dbo].[rndNumber] ([rndNO] uniqueidentifier NOT NULL);

-- [dbo.roadMng]  PK: roadMngId
CREATE TABLE [dbo].[roadMng] ([roadMngId] int NOT NULL, [roadNm] varchar(50) NOT NULL, [sido] varchar(50) NOT NULL, [gugun] varchar(50) NOT NULL, [dong] varchar(50) NOT NULL, [remark] varchar(300) NULL, [createUser] varchar(20) NULL, [createAt] smalldatetime NULL, [updateUser] varchar(20) NULL, [updateAt] smalldatetime NULL);

-- [dbo.RoadNameAddress]  PK: (없음)
CREATE TABLE [dbo].[RoadNameAddress] ([ZIPCODE] char(6) NOT NULL, [SEQ] varchar(10) NOT NULL, [CITY1] varchar(30) NULL, [CITY2] varchar(30) NULL, [CITY3] varchar(30) NULL, [CITY4] varchar(30) NULL, [CITY5] varchar(30) NULL, [CITY6] varchar(30) NULL, [CITY7] varchar(100) NULL, [CHG_YMD] datetime NULL, [ADDR] varchar(200) NULL, [ROADNM] varchar(100) NULL, [ROADID] varchar(20) NULL, [BLDNO1] int NULL, [BLDNO2] int NULL, [BLDNM] varchar(100) NULL, [LEGAL_NM] varchar(100) NULL, [LEGAL_CD] varchar(10) NULL, [TOWN] varchar(30) NULL, [SAN] tinyint NULL, [JIBUN_M] int NULL, [JIBUN_S] int NULL, [LON] int NULL, [LAT] int NULL);

-- [dbo.RoyaltyMng]  PK: beCd, yearMonth
CREATE TABLE [dbo].[RoyaltyMng] ([beCd] char(6) NOT NULL, [yearMonth] char(6) NOT NULL, [royaltyAmt] float NULL, [depositDiv] char(2) NULL, [remark] varchar(300) NULL, [closeYN] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.S3_Tmp]  PK: (없음)
CREATE TABLE [dbo].[S3_Tmp] ([sdir] nvarchar(4000) NULL, [ID] int IDENTITY NOT NULL);

-- [dbo.sample]  PK: (없음)
CREATE TABLE [dbo].[sample] ([품목코드] nvarchar(255) NULL, [품목명] nvarchar(255) NULL, [관리소속] nvarchar(255) NULL, [단위] nvarchar(255) NULL, [단가] float NULL, [판매단가] float NULL, [안전재고수량] float NULL, [제조사] nvarchar(255) NULL, [규격] nvarchar(255) NULL, [사용유무] nvarchar(255) NULL, [비고] nvarchar(255) NULL);

-- [dbo.SchLecturer]  PK: opSubjcd, schDat, lectCd
CREATE TABLE [dbo].[SchLecturer] ([opSubjcd] char(10) NOT NULL, [schDat] char(8) NOT NULL, [lectCd] char(5) NOT NULL, [amount] float NULL, [remark] varchar(300) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ShareMemo]  PK: ShareIdx
CREATE TABLE [dbo].[ShareMemo] ([ShareIdx] int NOT NULL, [SMemoDt] char(8) NOT NULL, [belongNm] varchar(50) NULL, [typeNM] varchar(50) NULL, [Memo] varchar(500) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.SMS_BATCH_DETAIL]  PK: detailId
CREATE TABLE [dbo].[SMS_BATCH_DETAIL] ([detailId] bigint NOT NULL, [masterId] int NOT NULL, [recNum] varchar(20) NOT NULL, [recSeq] varchar(20) NULL, [memName] varchar(50) NULL, [phone] varchar(20) NOT NULL, [messageTxt] nvarchar(1000) NULL, [sendStatus] varchar(1) NOT NULL, [sendDt] smalldatetime NULL, [createdAt] datetime NULL);

-- [dbo.SMS_BATCH_MASTER]  PK: masterId
CREATE TABLE [dbo].[SMS_BATCH_MASTER] ([masterId] int NOT NULL, [regUser] varchar(20) NOT NULL, [regDt] varchar(8) NOT NULL, [reserveDt] varchar(20) NOT NULL, [dtGubun] varchar(1) NOT NULL, [startDt] varchar(8) NOT NULL, [endDt] varchar(8) NOT NULL, [condStatus] varchar(20) NULL, [recType] varchar(10) NULL, [templateId] varchar(20) NOT NULL, [sendYN] varchar(1) NOT NULL, [remark] varchar(500) NULL, [createdAt] datetime NULL);

-- [dbo.SmsAutoHistory]  PK: autoSmsNo
CREATE TABLE [dbo].[SmsAutoHistory] ([autoSmsNo] bigint NOT NULL, [recNum] varchar(20) NOT NULL, [recSeq] varchar(3) NOT NULL, [memName] varchar(50) NULL, [mTempNo] varchar(3) NOT NULL, [sendDt] varchar(8) NOT NULL, [sendTm] varchar(6) NOT NULL, [sendHp] varchar(20) NOT NULL, [msgText] varchar(2000) NULL, [regDt] varchar(8) NULL, [regEmpCd] varchar(8) NULL);

-- [dbo.SmsHistory]  PK: smsNo
CREATE TABLE [dbo].[SmsHistory] ([smsNo] char(12) NOT NULL, [sendDt] char(8) NOT NULL, [sendTm] char(6) NOT NULL, [sendEmp] varchar(10) NOT NULL, [sendHp] varchar(20) NULL, [recvEmp] varchar(10) NOT NULL, [recvHp] varchar(20) NULL, [msgText] varchar(2000) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [reqTime] varchar(30) NULL);

-- [dbo.SmsReject]  PK: rejeNo
CREATE TABLE [dbo].[SmsReject] ([rejeNo] int NOT NULL, [Hphone] varchar(15) NOT NULL, [HpName] varchar(50) NOT NULL, [remark] varchar(100) NULL, [REGDAT] char(8) NULL, [REGEMP] char(5) NULL);

-- [dbo.SmsRejectList]  PK: rejeListNo
CREATE TABLE [dbo].[SmsRejectList] ([rejeListNo] int NOT NULL, [rejeDt] char(8) NOT NULL, [Hphone] varchar(15) NOT NULL, [msg] varchar(4000) NOT NULL, [REGDAT] char(8) NULL, [REGEMP] char(5) NULL);

-- [dbo.SmsStatAccounts]  PK: statAccNo
CREATE TABLE [dbo].[SmsStatAccounts] ([statAccNo] varchar(14) NOT NULL, [sendDt] char(8) NOT NULL, [sendHpNO] varchar(14) NOT NULL, [sendTit] varchar(50) NOT NULL, [sendHtml] varchar(MAX) NOT NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.sqlTableRemark]  PK: TableName
CREATE TABLE [dbo].[sqlTableRemark] ([TableName] varchar(50) NOT NULL, [TableComment] text NULL);

-- [dbo.stockBasic]  PK: (없음)
CREATE TABLE [dbo].[stockBasic] ([품목코드] nvarchar(255) NULL, [품목명] nvarchar(255) NULL, [관리소속] nvarchar(255) NULL, [단위] nvarchar(255) NULL, [단가] float NULL, [판매단가] float NULL, [안전재고수량] float NULL, [제조사] nvarchar(255) NULL, [규격] nvarchar(255) NULL, [사용유무] nvarchar(255) NULL, [비고] nvarchar(255) NULL);

-- [dbo.StockClose]  PK: closeYM
CREATE TABLE [dbo].[StockClose] ([closeYM] char(6) NOT NULL, [closeYN] char(1) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.StockMonth]  PK: closeYM, pItemCd
CREATE TABLE [dbo].[StockMonth] ([closeYM] char(6) NOT NULL, [pItemCd] char(6) NOT NULL, [smQty] float NULL, [smAmt] float NULL, [ipQty] float NULL, [ipAmt] float NULL, [opQty] float NULL, [opAmt] float NULL, [stQty] float NULL, [stAmt] float NULL, [cost] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.SubCost]  PK: SCostNo
CREATE TABLE [dbo].[SubCost] ([SCostNo] varchar(12) NOT NULL, [CostName] varchar(50) NOT NULL, [CostDt] char(8) NOT NULL, [CostEmp] varchar(7) NOT NULL, [SFCD] char(6) NOT NULL, [prodcd] varchar(6) NOT NULL, [SUBCATCD] varchar(5) NULL, [totalCost] numeric(20,5) NULL, [remark] varchar(500) NULL, [INSPERCODE] char(7) NULL, [INSDATE] smalldatetime NULL, [MODPERCODE] char(7) NULL, [MODDATE] smalldatetime NULL, [MODPC] varchar(20) NULL);

-- [dbo.Subj]  PK: SubjCd
CREATE TABLE [dbo].[Subj] ([SubjCd] char(6) NOT NULL, [SubjNm] varchar(100) NOT NULL, [Remark] varchar(200) NULL, [UseYn] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.SubjSchedule]  PK: opSubjcd, schDat
CREATE TABLE [dbo].[SubjSchedule] ([opSubjcd] char(10) NOT NULL, [schDat] char(8) NOT NULL, [startTm] char(4) NOT NULL, [endTm] char(4) NOT NULL, [remark] varchar(300) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.SUM_CalBalance]  PK: (없음)
CREATE TABLE [dbo].[SUM_CalBalance] ([calNo] varchar(12) NULL, [calDt] varchar(10) NULL, [beCd] char(6) NULL, [calDiv] varchar(1) NOT NULL, [accnCd] varchar(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(MAX) NULL, [Remark] varchar(200) NULL, [refDiv] varchar(2) NULL, [refNum] varchar(30) NULL, [calYN] varchar(1) NULL, [deleteFlag] varchar(1) NULL, [calDesc] varchar(200) NULL, [createYN] varchar(1) NULL, [cfmDt] varchar(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] varchar(1) NULL);

-- [dbo.SUM_CalBalance_20210412]  PK: (없음)
CREATE TABLE [dbo].[SUM_CalBalance_20210412] ([calNo] varchar(12) NULL, [calDt] varchar(10) NULL, [beCd] char(6) NULL, [calDiv] varchar(1) NOT NULL, [accnCd] varchar(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(MAX) NULL, [Remark] varchar(200) NULL, [refDiv] varchar(2) NULL, [refNum] varchar(30) NULL, [calYN] varchar(1) NULL, [deleteFlag] varchar(1) NULL, [calDesc] varchar(200) NULL, [createYN] varchar(1) NULL, [cfmDt] varchar(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] varchar(1) NULL);

-- [dbo.SUM_CalBalance_20240329]  PK: (없음)
CREATE TABLE [dbo].[SUM_CalBalance_20240329] ([calNo] varchar(12) NULL, [calDt] varchar(10) NULL, [beCd] char(6) NULL, [calDiv] varchar(1) NOT NULL, [accnCd] varchar(5) NOT NULL, [amount] float NULL, [tax] float NULL, [sumUp] varchar(MAX) NULL, [Remark] varchar(200) NULL, [refDiv] varchar(2) NULL, [refNum] varchar(30) NULL, [calYN] varchar(1) NULL, [deleteFlag] varchar(1) NULL, [calDesc] varchar(200) NULL, [createYN] varchar(1) NULL, [cfmDt] varchar(8) NULL, [cfmEmp] varchar(8) NULL, [cfmYN] varchar(1) NULL);

-- [dbo.sysdiagrams]  PK: diagram_id
CREATE TABLE [dbo].[sysdiagrams] ([name] sysname NOT NULL, [principal_id] int NOT NULL, [diagram_id] int IDENTITY NOT NULL, [version] int NULL, [definition] varbinary(MAX) NULL);

-- [dbo.t_bizLoc]  PK: bizLocCd
CREATE TABLE [dbo].[t_bizLoc] ([bizLocCd] char(5) NOT NULL, [bizLocNm] varchar(20) NOT NULL, [addr] varchar(50) NOT NULL, [phone] varchar(20) NOT NULL, [Fax] varchar(20) NULL);

-- [dbo.t_employee]  PK: empId
CREATE TABLE [dbo].[t_employee] ([empId] char(10) NOT NULL, [empNm] varchar(20) NOT NULL, [deptNm] varchar(20) NOT NULL, [phone] varchar(20) NOT NULL);

-- [dbo.t_product]  PK: prodCd
CREATE TABLE [dbo].[t_product] ([prodCd] char(5) NOT NULL, [prodNm] varchar(20) NOT NULL, [kind] char(1) NOT NULL, [price] float NULL, [stockQty] float NULL);

-- [dbo.t_vendor]  PK: vendorId
CREATE TABLE [dbo].[t_vendor] ([vendorId] char(10) NOT NULL, [vendorNm] varchar(20) NOT NULL, [addr] varchar(50) NULL, [phone] varchar(20) NULL, [Fax] varchar(20) NULL);

-- [dbo.tb_code_info]  PK: seq
CREATE TABLE [dbo].[tb_code_info] ([seq] int IDENTITY NOT NULL, [sp_code] varchar(7) NULL, [field_cd] varchar(30) NULL, [field_nm] varchar(30) NULL, [data_value] varchar(30) NULL, [parents_seq] varchar(30) NULL, [use_flag] varchar(2) NULL, [code_memo] text NULL, [update_date] datetime NULL, [sort_order] int NULL);

-- [dbo.tb_consult]  PK: seq
CREATE TABLE [dbo].[tb_consult] ([seq] int IDENTITY NOT NULL, [sp_code] varchar(30) NOT NULL, [consult_id] varchar(30) NOT NULL, [consult_date] datetime NOT NULL, [agent_id] varchar(30) NOT NULL, [agent_nm] varchar(30) NOT NULL, [extension_no] varchar(30) NULL, [group_nm] varchar(5) NULL, [chartno] varchar(50) NOT NULL, [client_nm] varchar(50) NOT NULL, [phone_no] varchar(20) NULL, [consult_type1] varchar(10) NOT NULL, [consult_type2] varchar(10) NOT NULL, [consult_result1] varchar(10) NOT NULL, [consult_result2] varchar(10) NOT NULL, [consult_memo] text NULL, [first_flag] varchar(11) NULL, [recall_flag] varchar(11) NULL, [appointment_flag] varchar(11) NULL, [unique_id] varchar(100) NULL, [branch] varchar(30) NULL);

-- [dbo.tb_consult_20220504]  PK: (없음)
CREATE TABLE [dbo].[tb_consult_20220504] ([seq] int IDENTITY NOT NULL, [sp_code] varchar(30) NOT NULL, [consult_id] varchar(30) NOT NULL, [consult_date] datetime NOT NULL, [agent_id] varchar(30) NOT NULL, [agent_nm] varchar(30) NOT NULL, [extension_no] varchar(30) NULL, [group_nm] varchar(5) NULL, [chartno] varchar(50) NOT NULL, [client_nm] varchar(50) NOT NULL, [phone_no] varchar(20) NULL, [consult_type1] varchar(10) NOT NULL, [consult_type2] varchar(10) NOT NULL, [consult_result1] varchar(10) NOT NULL, [consult_result2] varchar(10) NOT NULL, [consult_memo] text NULL, [first_flag] varchar(11) NULL, [recall_flag] varchar(11) NULL, [appointment_flag] varchar(11) NULL, [unique_id] varchar(100) NULL, [branch] varchar(30) NULL);

-- [dbo.tb_consult_interest]  PK: seq
CREATE TABLE [dbo].[tb_consult_interest] ([seq] int IDENTITY NOT NULL, [sp_code] varchar(30) NOT NULL, [consult_id] varchar(30) NOT NULL, [consult_date] datetime NOT NULL, [interest_part1] varchar(10) NOT NULL, [interest_part2] varchar(10) NOT NULL, [interest_part3] varchar(10) NOT NULL, [branch] varchar(30) NULL);

-- [dbo.tb_consult_interest_TEST]  PK: (없음)
CREATE TABLE [dbo].[tb_consult_interest_TEST] ([seq] int IDENTITY NOT NULL, [sp_code] varchar(30) NOT NULL, [consult_id] varchar(30) NOT NULL, [consult_date] datetime NOT NULL, [interest_part1] varchar(10) NOT NULL, [interest_part2] varchar(10) NOT NULL, [interest_part3] varchar(10) NOT NULL, [branch] varchar(30) NULL);

-- [dbo.tb_consult_TEST]  PK: (없음)
CREATE TABLE [dbo].[tb_consult_TEST] ([seq] int IDENTITY NOT NULL, [sp_code] varchar(30) NOT NULL, [consult_id] varchar(30) NOT NULL, [consult_date] datetime NOT NULL, [agent_id] varchar(30) NOT NULL, [agent_nm] varchar(30) NOT NULL, [extension_no] varchar(30) NULL, [group_nm] varchar(5) NULL, [chartno] varchar(50) NOT NULL, [client_nm] varchar(50) NOT NULL, [phone_no] varchar(20) NULL, [consult_type1] varchar(10) NOT NULL, [consult_type2] varchar(10) NOT NULL, [consult_result1] varchar(10) NOT NULL, [consult_result2] varchar(10) NOT NULL, [consult_memo] text NULL, [first_flag] varchar(11) NULL, [recall_flag] varchar(11) NULL, [appointment_flag] varchar(11) NULL, [unique_id] varchar(100) NULL, [branch] varchar(30) NULL);

-- [dbo.tb_jin_schedule]  PK: seq
CREATE TABLE [dbo].[tb_jin_schedule] ([seq] int IDENTITY NOT NULL, [start_date] varchar(10) NULL, [contents] text NULL, [m_date] varchar(10) NULL, [m_user] varchar(100) NULL, [use_yn] varchar(1) NULL, [u_date] varchar(10) NULL, [u_user] varchar(100) NULL, [sort] int NULL);

-- [dbo.tb_reserve_call]  PK: seq
CREATE TABLE [dbo].[tb_reserve_call] ([seq] numeric(18,0) IDENTITY NOT NULL, [call_dt] varchar(10) NULL, [cust_nm] varchar(50) NULL, [phone_no] varchar(20) NULL, [move_dt] varchar(10) NULL, [memo] text NULL, [insert_user] varchar(50) NULL, [insert_date] datetime NULL, [status] nchar(10) NULL, [edit_user] varchar(50) NULL, [edit_date] datetime NULL);

-- [dbo.TBL_MOPTION]  PK: OP_REGNO
CREATE TABLE [dbo].[TBL_MOPTION] ([OP_REGNO] bigint IDENTITY NOT NULL, [OP_IREGNO] varchar(30) NULL, [OP_IDATE] varchar(10) NOT NULL, [OP_JOBDAT] varchar(10) NOT NULL, [OP_BCODE] varchar(30) NULL, [OP_MCODE] varchar(30) NULL, [OP_PCODE] varchar(30) NULL, [OP_CNT] numeric(18,0) NULL, [OP_DANGA] numeric(18,0) NULL, [OP_TOTAL] numeric(18,0) NULL, [OP_STATUS] varchar(2) NULL, [OP_CBM] numeric(5,2) NULL, [OP_REGDATE] datetime NULL);

-- [dbo.TBL_MSG_HIST]  PK: CMP_MSG_ID
CREATE TABLE [dbo].[TBL_MSG_HIST] ([CMP_MSG_ID] varchar(20) NOT NULL, [CMP_MSG_GROUP_ID] varchar(20) NULL, [USR_ID] varchar(16) NOT NULL, [SMS_GB] char(1) NULL, [USED_CD] char(2) NOT NULL, [RESERVED_FG] char(1) NOT NULL, [RESERVED_DTTM] char(14) NULL, [SAVED_FG] char(1) NULL, [RCV_PHN_ID] varchar(24) NOT NULL, [SND_PHN_ID] varchar(24) NULL, [NAT_CD] varchar(8) NULL, [ASSIGN_CD] varchar(5) NULL, [SND_MSG] varchar(2000) NULL, [CALLBACK_URL] varchar(120) NULL, [CONTENT_CNT] int NULL, [CONTENT_MIME_TYPE] varchar(128) NULL, [CONTENT_PATH] varchar(1024) NULL, [CMP_SND_DTTM] char(14) NULL, [CMP_RCV_DTTM] char(14) NULL, [REG_SND_DTTM] char(14) NULL, [REG_RCV_DTTM] char(14) NULL, [MACHINE_ID] char(2) NULL, [SMS_STATUS] char(1) NULL, [RSLT_VAL] char(4) NULL, [MSG_TITLE] varchar(200) NULL, [TELCO_ID] char(4) NULL, [ETC_CHAR_1] varchar(100) NULL, [ETC_CHAR_2] varchar(100) NULL, [ETC_CHAR_3] varchar(100) NULL, [ETC_CHAR_4] varchar(100) NULL, [ETC_INT_5] int NULL, [ETC_INT_6] int NULL);

-- [dbo.TBL_SITTER]  PK: (없음)
CREATE TABLE [dbo].[TBL_SITTER] ([SITT_CODE] varchar(8) NOT NULL, [SITT_NAME] varchar(30) NULL, [SITT_STDAT] varchar(10) NULL, [SITT_UPDAT] varchar(10) NULL, [SITT_ENDAT] varchar(10) NULL, [SITT_JUMIN] varchar(14) NULL, [SITT_BIRTH] varchar(10) NULL, [SITT_BGUBN] varchar(2) NULL, [SITT_BAGE] varchar(2) NULL, [SITT_TELNO] varchar(14) NULL, [SITT_ZIP] varchar(7) NULL, [SITT_ADDRE1] varchar(100) NULL, [SITT_ADDRE2] varchar(100) NULL, [SITT_HPNO] varchar(14) NULL, [SITT_EMAIL] varchar(30) NULL, [SITT_SUBWAY] varchar(30) NULL, [SITT_HOBBY] varchar(30) NULL, [SITT_CARR] varchar(20) NULL, [SITT_CERT] varchar(300) NULL, [SITT_CINFO] varchar(1000) NULL, [SITT_FINFO] varchar(1000) NULL, [SITT_BINFO] varchar(500) NULL, [SITT_SINFO] varchar(500) NULL, [SITT_SERV] varchar(500) NULL, [SITT_AMT] numeric(18,0) NULL, [SITT_WORK] varchar(2) NULL, [SITT_RANK] varchar(2) NULL, [SITT_RECO] varchar(30) NULL, [SITT_GUBUN] varchar(2) NULL, [SITT_REMARK] varchar(500) NULL, [SITT_EXDOC] varchar(1000) NULL, [SITT_JISA] varchar(10) NULL, [SITT_JIJUM] varchar(10) NULL, [SITT_STATU] varchar(1) NULL, [SITT_BANKNM] varchar(20) NULL, [SITT_BANKNO] varchar(20) NULL, [SITT_BNAME] varchar(20) NULL, [SITT_NUMBER] varchar(20) NULL, [SITT_CHUR] varchar(20) NULL, [SITT_DAY] varchar(20) NULL, [SITT_TIME] varchar(20) NULL, [SITT_NEXDOC] varchar(1000) NULL, [SITT_EDU] varchar(50) NULL, [SITT_CITY] varchar(20) NULL, [SITT_CIGU] varchar(30) NULL, [SITT_CIDO] varchar(30) NULL, [SITT_CIBN] varchar(2) NULL, [SITT_CINM] varchar(40) NULL, [SITT_CIADDR] varchar(100) NULL, [SITT_CIBUN] varchar(4) NULL, [SITT_CIJI] varchar(4) NULL, [SITT_CIDONG] varchar(4) NULL, [SITT_CIHO] varchar(4) NULL, [WEEK1] char(1) NULL, [WEEK2] char(1) NULL, [WEEK3] char(1) NULL, [WEEK4] char(1) NULL, [WEEK5] char(1) NULL, [WEEK6] char(1) NULL, [WEEK7] char(1) NULL, [SITT_DIV] char(1) NULL, [imgFile] varchar(80) NULL);

-- [dbo.TBL_SUBMIT_QUEUE]  PK: CMP_MSG_ID
CREATE TABLE [dbo].[TBL_SUBMIT_QUEUE] ([CMP_MSG_ID] int IDENTITY NOT NULL, [CMP_MSG_GROUP_ID] varchar(20) NULL, [USR_ID] varchar(16) NOT NULL, [SMS_GB] char(1) NULL, [USED_CD] char(2) NOT NULL, [RESERVED_FG] char(1) NOT NULL, [RESERVED_DTTM] char(14) NOT NULL, [SAVED_FG] char(1) NULL, [RCV_PHN_ID] varchar(24) NOT NULL, [SND_PHN_ID] varchar(24) NULL, [NAT_CD] varchar(8) NULL, [ASSIGN_CD] varchar(5) NULL, [SND_MSG] varchar(2000) NULL, [CALLBACK_URL] varchar(120) NULL, [CONTENT_CNT] int NULL, [CONTENT_MIME_TYPE] varchar(128) NULL, [CONTENT_PATH] varchar(1024) NULL, [CMP_SND_DTTM] char(14) NULL, [CMP_RCV_DTTM] char(14) NULL, [REG_SND_DTTM] char(14) NULL, [REG_RCV_DTTM] char(14) NULL, [MACHINE_ID] char(2) NULL, [SMS_STATUS] char(1) NULL, [RSLT_VAL] char(4) NULL, [MSG_TITLE] varchar(200) NULL, [TELCO_ID] char(4) NULL, [ETC_CHAR_1] varchar(100) NULL, [ETC_CHAR_2] varchar(100) NULL, [ETC_CHAR_3] varchar(100) NULL, [ETC_CHAR_4] varchar(100) NULL, [ETC_INT_5] int NULL, [ETC_INT_6] int NULL);

-- [dbo.tblRandCode]  PK: RandCode
CREATE TABLE [dbo].[tblRandCode] ([RandCode] varchar(12) NOT NULL);

-- [dbo.test]  PK: (없음)
CREATE TABLE [dbo].[test] ([recnum] nvarchar(255) NULL);

-- [dbo.TEST1]  PK: (없음)
CREATE TABLE [dbo].[TEST1] ([rcode] smallint NULL, [rname] nchar(254) NULL, [calldate] date NULL, [calltime] time(0) NULL, [starttime] nvarchar(40) NULL, [endtime] nvarchar(40) NULL, [didnum] nchar(150) NULL, [exten] nchar(254) NULL, [cid_num] nchar(50) NULL, [cid_name] nchar(150) NULL, [holdt] int NULL, [callt] int NULL, [dur] int NULL, [qprio] smallint NULL, [reason] nchar(254) NULL, [src_uid] nchar(254) NOT NULL, [dst_uid] nchar(254) NULL, [aucode] smallint NULL, [lrcode] smallint NULL, [lrname] nchar(254) NULL);

-- [dbo.TEST2]  PK: (없음)
CREATE TABLE [dbo].[TEST2] ([uniqueid] nvarchar(80) NOT NULL, [calldate] date NULL, [calltime] time(0) NULL, [p_mode] smallint NULL, [p_arg1] nchar(100) NULL, [p_arg2] nchar(100) NULL, [p_arg3] nchar(100) NULL, [p_num1] int NULL, [p_num2] int NULL);

-- [dbo.TEST3]  PK: (없음)
CREATE TABLE [dbo].[TEST3] ([calldate] date NULL, [calltime] time(0) NULL, [answertime] nvarchar(40) NULL, [endtime] nvarchar(40) NULL, [clid] nvarchar(80) NULL, [src] nvarchar(80) NULL, [dst] nvarchar(80) NULL, [dcontext] nvarchar(80) NULL, [channel] nvarchar(80) NULL, [dstchannel] nvarchar(80) NULL, [lastapp] nvarchar(80) NULL, [lastdata] nvarchar(80) NULL, [duration] int NULL, [billsec] int NULL, [disposition] nvarchar(45) NULL, [amaflags] int NULL, [accountcode] nvarchar(80) NULL, [uniqueid] nvarchar(100) NOT NULL, [userfield] nvarchar(100) NULL, [xflg] smallint NULL, [pddtime] nvarchar(40) NULL, [pddsec] smallint NULL, [xmode] smallint NULL, [xblind] nvarchar(80) NULL, [dnid] nchar(150) NULL, [linkedid] nchar(100) NULL, [custref] nchar(150) NULL, [yflg] smallint NULL, [src_tcode] smallint NULL, [dst_tcode] smallint NULL);

-- [dbo.toss20240711]  PK: (없음)
CREATE TABLE [dbo].[toss20240711] ([아파트명] nvarchar(255) NULL, [우편번호] nvarchar(255) NULL, [거래금액] float NULL, [면적] float NULL, [평] float NULL, [토스비용] float NULL, [시도] nvarchar(255) NULL, [구군] nvarchar(255) NULL, [동] nvarchar(255) NULL, [도로명주소] nvarchar(255) NULL, [본번호코드] float NULL, [부번호코드] float NULL, [도로명코드] float NULL, [도로명일련번호] float NULL, [우편번호 탐색용] nvarchar(255) NULL);

-- [dbo.TossAreaBelong]  PK: autoId
CREATE TABLE [dbo].[TossAreaBelong] ([autoId] int NOT NULL, [sido] varchar(40) NOT NULL, [gubun] varchar(40) NOT NULL, [dong] varchar(40) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] varchar(20) NULL, [seq] int NULL, [useYN] varchar(1) NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.TossAreaBelong_20250304]  PK: (없음)
CREATE TABLE [dbo].[TossAreaBelong_20250304] ([autoId] int NOT NULL, [sido] varchar(40) NOT NULL, [gubun] varchar(40) NOT NULL, [dong] varchar(40) NOT NULL, [beCd] varchar(6) NOT NULL, [seq] int NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.TossAreaBelong_20250528]  PK: (없음)
CREATE TABLE [dbo].[TossAreaBelong_20250528] ([autoId] int NOT NULL, [sido] varchar(40) NOT NULL, [gubun] varchar(40) NOT NULL, [dong] varchar(40) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] varchar(20) NULL, [seq] int NULL, [useYN] varchar(1) NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.TossAreaBelong_20260201]  PK: (없음)
CREATE TABLE [dbo].[TossAreaBelong_20260201] ([autoId] int NOT NULL, [sido] varchar(40) NOT NULL, [gubun] varchar(40) NOT NULL, [dong] varchar(40) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] varchar(20) NULL, [seq] int NULL, [useYN] varchar(1) NULL, [remark] varchar(300) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.tossAuth]  PK: empCod
CREATE TABLE [dbo].[tossAuth] ([empCod] varchar(20) NOT NULL, [sTim] varchar(4) NOT NULL, [eTim] varchar(4) NOT NULL, [authYN] varchar(1) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.upload_cate]  PK: (없음)
CREATE TABLE [dbo].[upload_cate] ([cateCd] nvarchar(255) NULL, [cateNm] nvarchar(255) NULL, [upCateCd] nvarchar(255) NULL, [remark] nvarchar(255) NULL, [seq] float NULL, [useYn] nvarchar(255) NULL);

-- [dbo.upload_item]  PK: (없음)
CREATE TABLE [dbo].[upload_item] ([itemCd] char(6) NULL, [itemNm] varchar(50) NULL, [beCd] varchar(6) NULL, [withBeCd] varchar(6) NULL, [cateCd] char(6) NULL, [unit] float NULL, [price] float NULL, [baseQty] float NULL, [amount] float NULL, [salAmt] float NULL, [suppAmt] float NULL, [calDiv] char(3) NULL, [taxYN] char(1) NULL, [recType] float NULL, [itemInfo] nvarchar(255) NULL, [imgFile] varchar(50) NULL, [endDt] float NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ViewAuthReq]  PK: viewReqIdx
CREATE TABLE [dbo].[ViewAuthReq] ([viewReqIdx] int NOT NULL, [reqDat] varchar(8) NOT NULL, [reqDatTim] varchar(6) NOT NULL, [reqEmpCod] varchar(8) NOT NULL, [progId] varchar(50) NOT NULL, [reqTit] varchar(100) NULL, [reqDesc] varchar(500) NULL, [reqStat] varchar(2) NULL, [reqTimes] int NULL, [apprEmpCod] varchar(8) NULL, [apprDate] smalldatetime NULL, [apprDesc] varchar(500) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ViT_ReceiptStat]  PK: (없음)
CREATE TABLE [dbo].[ViT_ReceiptStat] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ViT_ReceiptStatAll]  PK: (없음)
CREATE TABLE [dbo].[ViT_ReceiptStatAll] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ViT_ReceiptStatAll2]  PK: (없음)
CREATE TABLE [dbo].[ViT_ReceiptStatAll2] ([recNum] char(12) NOT NULL, [recSeq] char(3) NOT NULL, [seqNum] char(3) NOT NULL, [procDt] char(8) NULL, [fromStat] char(2) NULL, [frombeCd] varchar(6) NULL, [fromEmp] varchar(8) NULL, [toStat] char(2) NULL, [tobeCd] varchar(6) NULL, [toEmp] varchar(8) NULL, [cancelCd] char(2) NULL, [cancelDesc] varchar(300) NULL, [finalDiv] char(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.WACCEPT]  PK: Accept_Code
CREATE TABLE [dbo].[WACCEPT] ([Accept_Code] char(13) NOT NULL, [Accept_Date] char(10) NOT NULL, [memID] char(12) NOT NULL, [Process_Code] varchar(8) NOT NULL, [Counsel_Code_Level1] varchar(8) NOT NULL, [Counsel_Content] nvarchar(500) NOT NULL, [Callback_Seq] int NOT NULL, [Insert_Code] char(8) NOT NULL, [Insert_Date] datetime NOT NULL);

-- [dbo.WCALLBACK]  PK: Seq
CREATE TABLE [dbo].[WCALLBACK] ([Seq] int IDENTITY NOT NULL, [PHONE_NUM] varchar(20) NOT NULL, [CB_DATE] char(10) NULL, [CB_TIME] char(8) NULL, [Counselor_Code] char(8) NULL, [Counselor_Ext] char(3) NULL, [ACCEPT_YN] char(1) NULL, [ACCEPT_NO] char(12) NULL, [Counselor_Date] datetime NULL, [Manager_Code] char(8) NULL, [Manager_Date] datetime NULL, [Seq_PBX] int NULL);

-- [dbo.WCDR_HIS]  PK: Seq
CREATE TABLE [dbo].[WCDR_HIS] ([Seq] int IDENTITY NOT NULL, [Menu_Number] varchar(30) NULL, [CID_Number] varchar(20) NULL, [CID_Name] varchar(30) NULL, [memID] char(12) NULL, [empCod] char(8) NULL, [Insert_Week] varchar(8) NULL, [Insert_Date] datetime NULL);

-- [dbo.WCDR_HIS_PRV]  PK: (없음)
CREATE TABLE [dbo].[WCDR_HIS_PRV] ([Seq] int IDENTITY NOT NULL, [Check_Flag] char(1) NULL, [Menu_Number] varchar(30) NULL, [CID_Number] varchar(20) NULL, [CID_Name] varchar(30) NULL, [empCod] char(8) NULL, [Insert_Week] varchar(8) NULL, [Insert_Date] datetime NULL);

-- [dbo.WEB_TOSS]  PK: (없음)
CREATE TABLE [dbo].[WEB_TOSS] ([IDX] int IDENTITY NOT NULL, [RECNUM] varchar(12) NULL, [RECSEQ] varchar(3) NULL, [loginEmpCd] varchar(20) NULL, [toBeCd] varchar(6) NULL, [toEmpCd] varchar(20) NULL, [tossCd] varchar(2) NULL, [tossDesc] varchar(100) NULL, [MODIDATE] smalldatetime NULL);

-- [dbo.WMENU_HIS]  PK: (없음)
CREATE TABLE [dbo].[WMENU_HIS] ([INC] int IDENTITY NOT NULL, [LogUserID] varchar(20) NULL, [UserCode] varchar(20) NULL, [Use_Name] varchar(100) NULL, [Use_IP] varchar(100) NULL, [Insert_Date] datetime NULL);

-- [dbo.Worker]  PK: workIdx
CREATE TABLE [dbo].[Worker] ([workIdx] char(5) NOT NULL, [WorkDiv] char(2) NOT NULL, [WorkNm] varchar(50) NOT NULL, [hphone] varchar(14) NOT NULL, [resdno] varchar(20) NOT NULL, [backCd] char(2) NULL, [acccNo] varchar(50) NULL, [useYN] char(1) NULL, [remark] varchar(300) NULL, [regDt] smalldatetime NULL, [regEmpCd] varchar(8) NULL, [modiDt] smalldatetime NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.WorkSch]  PK: workNo
CREATE TABLE [dbo].[WorkSch] ([workNo] char(12) NOT NULL, [workDiv] char(2) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [workDt] char(8) NOT NULL, [workFrTim] char(4) NOT NULL, [workToTim] char(4) NOT NULL, [workDesc] text NOT NULL, [RefNum] varchar(50) NOT NULL, [nyn] varchar(1) NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL, [MemoDiv] varchar(50) NULL);

-- [dbo.WorkSch_20121019]  PK: (없음)
CREATE TABLE [dbo].[WorkSch_20121019] ([workNo] char(12) NOT NULL, [workDiv] char(2) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [workDt] char(8) NOT NULL, [workFrTim] char(4) NOT NULL, [workToTim] char(4) NOT NULL, [workDesc] varchar(500) NOT NULL, [RefNum] varchar(50) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.WorkSch_20150407]  PK: workNo
CREATE TABLE [dbo].[WorkSch_20150407] ([workNo] char(12) NOT NULL, [workDiv] char(2) NOT NULL, [beCd] varchar(6) NOT NULL, [empCod] char(8) NOT NULL, [workDt] char(8) NOT NULL, [workFrTim] char(4) NOT NULL, [workToTim] char(4) NOT NULL, [workDesc] varchar(8000) NOT NULL, [RefNum] varchar(50) NOT NULL, [regDt] char(8) NULL, [regEmpCd] varchar(8) NULL, [modiDt] char(8) NULL, [modiEmpCd] varchar(8) NULL);

-- [dbo.ZipCode]  PK: seq
CREATE TABLE [dbo].[ZipCode] ([seq] int NOT NULL, [zipcode] nvarchar(6) NULL, [sido] nvarchar(40) NULL, [gubun] nvarchar(40) NULL, [dong] nvarchar(40) NULL, [ri] nvarchar(60) NULL, [bldg] nvarchar(60) NULL, [st_bunji] nvarchar(60) NULL, [ed_bunji] nvarchar(60) NULL);

-- [dbo.zipCode_dong]  PK: (없음)
CREATE TABLE [dbo].[zipCode_dong] ([sido] nvarchar(40) NULL, [gubun] nvarchar(40) NULL, [dong] nvarchar(40) NULL);

-- [dbo.zipCode_dong_20250226]  PK: (없음)
CREATE TABLE [dbo].[zipCode_dong_20250226] ([sido] nvarchar(40) NULL, [gubun] nvarchar(40) NULL, [dong] nvarchar(40) NULL);

-- [dbo.zipCode_dong_20250525]  PK: (없음)
CREATE TABLE [dbo].[zipCode_dong_20250525] ([sido] nvarchar(40) NULL, [gubun] nvarchar(40) NULL, [dong] nvarchar(40) NULL);

-- [dbo.ZIPCODE_ROADCODE]  PK: (없음)
CREATE TABLE [dbo].[ZIPCODE_ROADCODE] ([ZIPID] varchar(10) NOT NULL, [ZIPLEVEL] int NOT NULL, [PARZIPID] varchar(10) NULL, [ZIPIDNM] varchar(100) NULL, [USEYN] char(1) NULL);


-- ================= FOREIGN KEYS =================
-- (외래키 없음 — 관계가 암묵적일 가능성)
