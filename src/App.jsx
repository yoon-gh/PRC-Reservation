import React, { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";

const FACILITY_STATUS = Object.freeze({ AVAILABLE: "available", IN_USE: "in_use" });
const FACILITY_STATUS_LABEL = Object.freeze({ available: "사용 가능", in_use: "사용 중" });

const RESERVATION_STATUS = Object.freeze({
  APPROVED: "approved",
  PENDING: "pending",
  MAINTENANCE: "maintenance",
  REJECTED: "rejected",
});

const RESERVATION_STATUS_LABEL = Object.freeze({
  approved: "승인완료",
  pending: "승인대기",
  maintenance: "점검",
  rejected: "반려",
});

const CATEGORY = Object.freeze({
  ALL: "all",
  GROWTH: "growth",
  IMAGING: "imaging",
  MAINTENANCE: "maintenance",
});

const CATEGORY_LABEL = Object.freeze({
  all: "전체",
  growth: "재배",
  imaging: "촬영",
  maintenance: "점검",
});

const PAGE = Object.freeze({ OVERVIEW: "overview", STATUS: "status", RESERVE: "reserve", ADMIN: "admin" });

const STATUS_CLASS = {
  available: "available-badge",
  in_use: "in_use-badge",
  approved: "approved-badge",
  pending: "pending-badge",
  maintenance: "maintenance-badge",
  rejected: "rejected-badge",
};

const categoryIcon = { all: "📅", growth: "🌱", imaging: "📷", maintenance: "🛠" };

const growthFacilities = [
  { id: "G-01", name: "컨베이어 온실", status: FACILITY_STATUS.AVAILABLE },
  { id: "G-02", name: "XYZ 인공환경실", status: FACILITY_STATUS.IN_USE },
  { id: "G-03", name: "인공환경재배실 1", status: FACILITY_STATUS.AVAILABLE },
  { id: "G-04", name: "인공환경재배실 2", status: FACILITY_STATUS.AVAILABLE },
  { id: "G-05", name: "인공환경재배실 3", status: FACILITY_STATUS.AVAILABLE },
];

const imagingFacilities = [
  { id: "I-01", name: "컨베이어 엽록소형광", sensors: ["엽록소형광"], status: FACILITY_STATUS.AVAILABLE },
  { id: "I-02", name: "컨베이어 다중영상촬영", sensors: ["다분광", "열화상", "LiDAR"], status: FACILITY_STATUS.AVAILABLE },
  { id: "I-03", name: "XYZ 다중영상촬영", sensors: ["다분광", "초분광", "열화상"], status: FACILITY_STATUS.IN_USE },
  { id: "I-04", name: "소형 초분광 촬영", sensors: ["초분광"], status: FACILITY_STATUS.AVAILABLE },
  { id: "I-05", name: "소형 다분광 촬영", sensors: ["다분광"], status: FACILITY_STATUS.AVAILABLE },
];

const allFacilities = [...growthFacilities, ...imagingFacilities];

const defaultForm = {
  category: CATEGORY.IMAGING,
  facility: imagingFacilities[0].name,
  bookingMode: "single",
  title: "",
  user: "",
  crop: "",
  start: "2026-05-13T09:00",
  end: "2026-05-13T18:00",
  recurringStartDate: "2026-05-13",
  recurringEndDate: "2026-05-13",
  recurringStartTime: "09:00",
  recurringEndTime: "10:00",
  imagingMode: "독립 촬영",
  growthImagingPlan: "미촬영",
};

const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

function getStatusLabel(status) {
  return FACILITY_STATUS_LABEL[status] || RESERVATION_STATUS_LABEL[status] || status;
}

function getCategoryLabel(category) {
  return CATEGORY_LABEL[category] || category;
}

function toDate(value) {
  return value ? new Date(value) : null;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date || Number.isNaN(date.getTime())) return "-";
  return `${dateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatPeriod(reservation) {
  const start = toDate(reservation.start);
  const end = toDate(reservation.end);
  if (!start || !end) return "-";
  return dateKey(start) === dateKey(end) ? dateKey(start) : `${dateKey(start)} ~ ${dateKey(end)}`;
}

function formatShortPeriod(reservation) {
  const start = toDate(reservation.start);
  const end = toDate(reservation.end);
  if (!start || !end) return "-";
  const short = (date) => `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${short(start)}~${short(end)}`;
}

function formatTime(reservation) {
  const start = toDate(reservation.start);
  const end = toDate(reservation.end);
  if (!start || !end) return "-";
  if (reservation.category === CATEGORY.GROWTH) return "장기 재배";
  return `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}–${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

function getFacilitiesByCategory(category) {
  if (category === CATEGORY.GROWTH) return growthFacilities;
  if (category === CATEGORY.IMAGING) return imagingFacilities;
  if (category === CATEGORY.MAINTENANCE) return allFacilities;
  return allFacilities;
}

function filterReservationsByCategory(reservations, category) {
  if (category === CATEGORY.ALL) return reservations;
  return reservations.filter((reservation) => reservation.category === category);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function filterReservationsByMonth(reservations, month) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  return reservations.filter((reservation) => rangesOverlap(toDate(reservation.start), toDate(reservation.end), start, end));
}

function getReservationStats(reservations) {
  return reservations.reduce(
    (acc, reservation) => {
      acc.total += 1;
      if (reservation.status === RESERVATION_STATUS.PENDING) acc.pending += 1;
      if (reservation.status === RESERVATION_STATUS.MAINTENANCE) acc.maintenance += 1;
      if (reservation.status === RESERVATION_STATUS.APPROVED) acc.approved += 1;
      if (reservation.status === RESERVATION_STATUS.REJECTED) acc.rejected += 1;
      return acc;
    },
    { total: 0, pending: 0, maintenance: 0, approved: 0, rejected: 0 }
  );
}

function findReservationConflict(reservations, candidate, ignoreId = null) {
  const candidateStart = toDate(candidate.start);
  const candidateEnd = toDate(candidate.end);

  if (!candidateStart || !candidateEnd || Number.isNaN(candidateStart.getTime()) || Number.isNaN(candidateEnd.getTime())) {
    return { message: "시작/종료 일시를 올바르게 입력해 주세요." };
  }

  if (candidateStart >= candidateEnd) {
    return { message: "종료 일시는 시작 일시보다 늦어야 합니다." };
  }

  const conflict = reservations.find((reservation) => {
    if (reservation.id === ignoreId) return false;
    if (reservation.status === RESERVATION_STATUS.REJECTED) return false;
    if (reservation.facility !== candidate.facility) return false;
    return rangesOverlap(candidateStart, candidateEnd, toDate(reservation.start), toDate(reservation.end));
  });

  return conflict ? { message: `중복 예약: ${conflict.title} (${formatDateTime(conflict.start)} ~ ${formatDateTime(conflict.end)})` } : null;
}

function getCalendarDays(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - first.getDay());
  const days = [];

  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push({ date: day, key: dateKey(day), inMonth: day.getMonth() === monthIndex });
  }

  return { days, label: `${year}년 ${monthIndex + 1}월` };
}

function getReservationsForDay(reservations, day) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return reservations.filter((reservation) => rangesOverlap(toDate(reservation.start), toDate(reservation.end), dayStart, dayEnd));
}

function groupReservationsByDay(reservations, month) {
  const monthReservations = filterReservationsByMonth(reservations, month);
  const groups = new Map();

  monthReservations.forEach((reservation) => {
    const start = toDate(reservation.start);
    const end = toDate(reservation.end);
    if (!start || !end) return;

    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    const final = new Date(end);
    final.setHours(0, 0, 0, 0);

    while (cursor <= final) {
      if (cursor.getMonth() === month.getMonth() && cursor.getFullYear() === month.getFullYear()) {
        const key = dateKey(cursor);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(reservation);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, items }));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function buildReservationsCsv(reservations) {
  const headers = ["ID", "구분", "시설/장비", "예약명", "작목", "신청자/소속", "시작", "종료", "연계", "상태"];
  const rows = reservations.map((reservation) => [
    reservation.id,
    getCategoryLabel(reservation.category),
    reservation.facility,
    reservation.title,
    reservation.crop,
    reservation.user,
    formatDateTime(reservation.start),
    formatDateTime(reservation.end),
    reservation.linked,
    getStatusLabel(reservation.status),
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadReservationsCsv(reservations, filename = "pprc_reservations.csv") {
  const blob = new Blob(["\ufeff" + buildReservationsCsv(reservations)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function mapDbToReservation(row) {
  return {
    id: row.id,
    category: row.category,
    facility: row.facility,
    title: row.title,
    crop: row.crop || "",
    user: row.user_name || "",
    start: row.start_time,
    end: row.end_time,
    status: row.status,
    linked: row.linked || "",
  };
}

function mapReservationToDb(reservation) {
  return {
    category: reservation.category,
    facility: reservation.facility,
    title: reservation.title,
    crop: reservation.crop,
    user_name: reservation.user,
    start_time: reservation.start,
    end_time: reservation.end,
    status: reservation.status,
    linked: reservation.linked,
  };
}

function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASS[status] || ""}`}>{getStatusLabel(status)}</span>;
}

function Button({ children, variant = "dark", ...props }) {
  return <button className={`btn ${variant}`} {...props}>{children}</button>;
}

function HeaderDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function handleOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="th-dropdown" ref={rootRef}>
      <button type="button" className="th-dropdown-trigger" onClick={() => setOpen((prev) => !prev)}>
        {label} {selected ? `: ${selected.label}` : ""} ▼
      </button>
      {open && (
      <div className="th-dropdown-menu">
        {options.map((option) => (
          <button key={option.value} type="button" className={option.value === value ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>
            {option.label}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="section-title">
      <div className="icon-box">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function FacilityCard({ item }) {
  const showSensorMemo = item.name.includes("다중영상촬영") && Array.isArray(item.sensors);
  return (
    <div className={`card facility ${item.status}`}>
      <div className="facility-top">
        <small>{item.id}</small>
        <StatusBadge status={item.status} />
      </div>
      <div>
        <h3>{item.name}</h3>
        {showSensorMemo && <div className="sensor-note"> {item.sensors.join(", ")}</div>}
      </div>
    </div>
  );
}

function ReservationForm({ reservations, onAddReservation, disabled, isAdmin = false, initialCategory = CATEGORY.IMAGING }) {
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState(null);
  const selectableFacilities = getFacilitiesByCategory(form.category);
  const isImaging = form.category === CATEGORY.IMAGING;
  const isGrowth = form.category === CATEGORY.GROWTH;
  const isMaintenance = form.category === CATEGORY.MAINTENANCE;
  const isRecurring = form.bookingMode === "recurring";
  const canSelectMaintenance = isAdmin;

  useEffect(() => {
    setForm((prev) => {
      const facilities = getFacilitiesByCategory(initialCategory);
      return { ...prev, category: initialCategory, facility: facilities[0]?.name || "" };
    });
  }, [initialCategory]);

  function updateForm(field, value) {
    if (field === "category") {
      const facilities = getFacilitiesByCategory(value);
      setForm((prev) => ({ ...prev, category: value, facility: facilities[0]?.name || "" }));
      setMessage(null);
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  async function submitReservation(event) {
    event.preventDefault();

    const baseReservation = {
      category: form.category,
      facility: form.facility,
      title: form.title.trim() || (isMaintenance ? "장비 점검" : "신규 예약"),
      crop: isMaintenance ? "-" : form.crop.trim() || "미입력",
      user: form.user.trim() || "미입력",
      status: isMaintenance ? RESERVATION_STATUS.MAINTENANCE : RESERVATION_STATUS.PENDING,
      linked: isMaintenance
        ? "예약 불가"
        : isImaging
          ? form.imagingMode
          : isGrowth
            ? (form.growthImagingPlan === "촬영 예정" ? form.imagingMode : "미촬영")
            : "미연계",
    };
    const candidates = [];

    if (isRecurring && isImaging) {
      const rangeStart = toDate(`${form.recurringStartDate}T00:00`);
      const rangeEnd = toDate(`${form.recurringEndDate}T00:00`);
      if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
        setMessage({ type: "error", text: "반복 예약의 시작/종료 날짜를 확인해 주세요." });
        return;
      }
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const day = dateKey(cursor);
        candidates.push({
          ...baseReservation,
          id: crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${day}`,
          start: `${day}T${form.recurringStartTime}`,
          end: `${day}T${form.recurringEndTime}`,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      candidates.push({
        ...baseReservation,
        id: crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`,
        start: form.start,
        end: form.end,
      });
    }

    if (isMaintenance && !isAdmin) {
      setMessage({ type: "error", text: "점검 예약 등록은 관리자만 가능합니다." });
      return;
    }

    const existingAndPending = [...reservations];
    for (const candidate of candidates) {
      const conflict = findReservationConflict(existingAndPending, candidate);
      if (conflict) {
        setMessage({ type: "error", text: conflict.message });
        return;
      }
      existingAndPending.push(candidate);
    }

    const result = candidates.length > 1
      ? await onAddReservation(candidates)
      : await onAddReservation(candidates[0]);
    if (result?.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "success", text: `${candidates.length}건 예약 신청이 저장되었습니다. 관리자가 승인하면 확정됩니다.` });
  }

  return (
    <div className="card form-card">
      <form onSubmit={submitReservation}>
        <div className="table-head" style={{ padding: 0, border: 0, marginBottom: 14 }}>
          <div>
            <h3>예약 신청</h3>
            <p>동일 시설·장비의 시간 중복 여부를 확인한 뒤 저장합니다.</p>
          </div>
          <Button type="submit" disabled={disabled}>저장</Button>
        </div>
        {message && <div className={`message ${message.type}`}>{message.text}</div>}
        {disabled && <div className="setup-note">Supabase 환경변수가 설정되지 않아 저장 기능이 비활성화되었습니다.</div>}
        <div className="form-grid">
          <label>예약 구분
            <select value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
              <option value={CATEGORY.IMAGING}>촬영</option>
              <option value={CATEGORY.GROWTH}>재배</option>
              {canSelectMaintenance && <option value={CATEGORY.MAINTENANCE}>점검</option>}
            </select>
          </label>
          <label>예약 대상
            <select value={form.facility} onChange={(event) => updateForm("facility", event.target.value)}>
              {selectableFacilities.map((facility) => <option key={facility.id} value={facility.name}>{facility.name}</option>)}
            </select>
          </label>
          <label>예약명
            <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="예: 배추 팁번 실험" />
          </label>
          <label>신청자/소속
            <input value={form.user} onChange={(event) => updateForm("user", event.target.value)} placeholder="예: 채소과 홍길동" />
          </label>
          {!isMaintenance && (
            <label className="full">작목
              <input value={form.crop} onChange={(event) => updateForm("crop", event.target.value)} placeholder="예: 배추, 딸기, 고추" />
            </label>
          )}
          {isImaging && (
            <label className="full">예약 입력 방식
              <select value={form.bookingMode} onChange={(event) => updateForm("bookingMode", event.target.value)}>
                <option value="single">단일 기간/시간</option>
                <option value="recurring">기간 내 매일 같은 시간</option>
              </select>
            </label>
          )}
          {isRecurring && isImaging ? (
            <>
              <label>반복 시작 날짜
                <input value={form.recurringStartDate} onChange={(event) => updateForm("recurringStartDate", event.target.value)} type="date" />
              </label>
              <label>반복 종료 날짜
                <input value={form.recurringEndDate} onChange={(event) => updateForm("recurringEndDate", event.target.value)} type="date" />
              </label>
              <label>매일 시작 시간
                <input value={form.recurringStartTime} onChange={(event) => updateForm("recurringStartTime", event.target.value)} type="time" />
              </label>
              <label>매일 종료 시간
                <input value={form.recurringEndTime} onChange={(event) => updateForm("recurringEndTime", event.target.value)} type="time" />
              </label>
            </>
          ) : (
            <>
              <label>시작 일시
                <input value={form.start} onChange={(event) => updateForm("start", event.target.value)} type="datetime-local" />
              </label>
              <label>종료 일시
                <input value={form.end} onChange={(event) => updateForm("end", event.target.value)} type="datetime-local" />
              </label>
            </>
          )}
          {isGrowth && (
            <label className="full">촬영 여부
              <select value={form.growthImagingPlan} onChange={(event) => updateForm("growthImagingPlan", event.target.value)}>
                <option>미촬영</option>
                <option>촬영 예정</option>
              </select>
            </label>
          )}
          {(isImaging || (isGrowth && form.growthImagingPlan === "촬영 예정")) && (
            <label className="full">촬영 방식
              <select value={form.imagingMode} onChange={(event) => updateForm("imagingMode", event.target.value)}>
                <option>독립 촬영</option>
                <option>연계 촬영</option>
              </select>
            </label>
          )}
        </div>
      </form>
    </div>
  );
}

function MonthlyCalendar({ reservations, selectedCategory, month, onMonthChange }) {
  const { days, label } = useMemo(() => getCalendarDays(month.getFullYear(), month.getMonth()), [month]);
  const visibleReservations = useMemo(() => filterReservationsByCategory(reservations, selectedCategory), [reservations, selectedCategory]);
  const mobileAgenda = useMemo(() => groupReservationsByDay(visibleReservations, month), [visibleReservations, month]);
  const todayKey = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dateKey(today);
  }, []);

  function moveMonth(offset) {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  return (
    <div className="card calendar-card">
      <div className="calendar-head">
        <div>
          <h3>월간 캘린더</h3>
          <p>선택한 구분의 예약을 월 단위로 표시합니다.</p>
        </div>
        <div className="calendar-controls">
          <Button type="button" variant="light" onClick={() => moveMonth(-1)}>이전</Button>
          <div className="calendar-title">{label}</div>
          <Button type="button" variant="light" onClick={() => moveMonth(1)}>다음</Button>
        </div>
      </div>

      <div className="calendar-scroll">
        <div className="calendar-grid">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => <div key={day} className="day-name">{day}</div>)}
          {days.map(({ date, key, inMonth }) => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
            const dayReservations = getReservationsForDay(visibleReservations, date).filter((reservation) => {
              if (reservation.category === CATEGORY.IMAGING) return true;

              const start = toDate(reservation.start);
              if (!start) return false;
              start.setHours(0, 0, 0, 0);
              if (start.getTime() === dayStart.getTime()) return true;
              return start < monthStart && dayStart.getTime() === monthStart.getTime();
            });
            const visible = dayReservations.slice(0, 3);
            const extra = dayReservations.length - visible.length;
            return (
              <div key={key} className={`day ${inMonth ? "" : "muted"} ${key === todayKey ? "today" : ""}`}>
                <strong className={key === todayKey ? "today-label" : ""}>{date.getDate()}</strong>
                {visible.map((reservation) => (
                  <div
                    key={`${reservation.id}-${key}`}
                    className={`event ${STATUS_CLASS[reservation.status]}`}
                    title={`${reservation.title} (${formatShortPeriod(reservation)})`}
                  >
                    {reservation.facility}
                  </div>
                ))}
                {extra > 0 && (
                  <div
                    className="sensor-note"
                    title={dayReservations
                      .slice(3)
                      .map((reservation) => `${reservation.facility} · ${reservation.title} (${formatShortPeriod(reservation)})`)
                      .join("\n")}
                  >
                    +{extra}건 더 있음
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mobile-agenda">
        {mobileAgenda.length === 0 ? (
          <div className="empty-mobile-card">해당 월 예약이 없습니다.</div>
        ) : mobileAgenda.map(({ key, items }) => (
          <div key={key} className="mobile-day-group">
            <div className="mobile-day-title">{key}</div>
            {items.map((reservation) => (
              <div key={`${key}-${reservation.id}`} className="mobile-reservation-card">
                <div className="mobile-card-top">
                  <strong>{reservation.title}</strong>
                  <StatusBadge status={reservation.status} />
                </div>
                <div className="mobile-card-line">{getCategoryLabel(reservation.category)} · {reservation.facility}</div>
                <div className="mobile-card-line">{formatPeriod(reservation)} / {formatTime(reservation)}</div>
                <div className="mobile-card-line">신청자: {reservation.user || "-"}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReservationTable({ reservations }) {
  const [filters, setFilters] = useState({ status: "all", facility: "all", user: "all", periodOrder: "desc" });
  const options = useMemo(() => ({
    status: Array.from(new Set(reservations.map((r) => r.status).filter(Boolean))),
    facility: Array.from(new Set(reservations.map((r) => r.facility).filter(Boolean))),
    user: Array.from(new Set(reservations.map((r) => r.user).filter(Boolean))),
  }), [reservations]);
  const visibleReservations = useMemo(() => {
    const filtered = reservations.filter((r) => {
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.facility !== "all" && r.facility !== filters.facility) return false;
      if (filters.user !== "all" && r.user !== filters.user) return false;
      return true;
    });
    return filtered.sort((a, b) => filters.periodOrder === "asc" ? toDate(a.start) - toDate(b.start) : toDate(b.start) - toDate(a.start));
  }, [reservations, filters]);

  return (
    <div className="card table-card">
      <div className="table-head">
        <div>
          <h3>예약 리스트</h3>
          <p>재배는 기간 단위, 촬영은 시간 단위로 표시합니다.</p>
        </div>
      </div>

      <div className="mobile-reservation-list">
        {visibleReservations.length === 0 ? (
          <div className="empty-mobile-card">표시할 예약이 없습니다.</div>
        ) : visibleReservations.map((reservation) => (
          <div className="mobile-reservation-card" key={`mobile-${reservation.id}`}>
            <div className="mobile-card-top">
              <strong>{reservation.title}</strong>
              <StatusBadge status={reservation.status} />
            </div>
            <div className="mobile-card-line">{getCategoryLabel(reservation.category)} · {reservation.facility}</div>
            <div className="mobile-card-line">작목: {reservation.crop || "-"}</div>
            <div className="mobile-card-line">{formatPeriod(reservation)} / {formatTime(reservation)}</div>
            <div className="mobile-card-line">연계: {reservation.linked || "-"}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap reservation-table-wrap">
        <table>
          <thead>
            <tr>
              <th>구분</th>
              <th><HeaderDropdown label="시설/장비" value={filters.facility} onChange={(next) => setFilters((p) => ({ ...p, facility: next }))} options={[{ value: "all", label: "전체" }, ...options.facility.map((v) => ({ value: v, label: v }))]} /></th>
              <th>예약명</th>
              <th>작목</th>
              <th><HeaderDropdown label="기간/일자" value={filters.periodOrder} onChange={(next) => setFilters((p) => ({ ...p, periodOrder: next }))} options={[{ value: "desc", label: "최신순" }, { value: "asc", label: "오래된순" }]} /></th>
              <th>시간</th><th>연계</th>
              <th><HeaderDropdown label="상태" value={filters.status} onChange={(next) => setFilters((p) => ({ ...p, status: next }))} options={[{ value: "all", label: "전체" }, ...options.status.map((v) => ({ value: v, label: getStatusLabel(v) }))]} /></th>
            </tr>
          </thead>
          <tbody>
            {visibleReservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{getCategoryLabel(reservation.category)}</td>
                <td>{reservation.facility}</td>
                <td><strong>{reservation.title}</strong></td>
                <td>{reservation.crop}</td>
                <td>{formatPeriod(reservation)}</td>
                <td>{formatTime(reservation)}</td>
                <td>↔ {reservation.linked}</td>
                <td><StatusBadge status={reservation.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminLogin({ session, onLogin, onLogout, isAdmin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setMessage({ type: "error", text: "Supabase 환경변수가 설정되지 않았습니다." });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }

    const signedEmail = data.user?.email?.toLowerCase();
    if (!adminEmails.includes(signedEmail)) {
      await supabase.auth.signOut();
      setMessage({ type: "error", text: "관리자 이메일 목록에 없는 계정입니다." });
      return;
    }

    setMessage(null);
    onLogin(data.session);
  }

  if (session && isAdmin) {
    return (
      <div className="card login-card">
        <h3>관리자 로그인됨</h3>
        <p>{session.user.email}</p>
        <Button type="button" variant="light" onClick={onLogout}>로그아웃</Button>
      </div>
    );
  }

  return (
    <div className="card login-card">
      <h3>관리자 로그인</h3>
      {!isSupabaseConfigured && <div className="setup-note">.env.local에 Supabase URL과 Anon Key를 설정해야 합니다.</div>}
      {adminEmails.length === 0 && <div className="setup-note">VITE_ADMIN_EMAILS에 관리자 이메일을 입력해야 합니다.</div>}
      {message && <div className={`message ${message.type}`}>{message.text}</div>}
      <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
        <label>관리자 이메일
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" />
        </label>
        <label>비밀번호
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <Button type="submit" disabled={!isSupabaseConfigured || adminEmails.length === 0}>로그인</Button>
      </form>
    </div>
  );
}

function AdminReservationPanel({ reservations, onUpdateReservation, onDeleteReservation, calendarMonth }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);
  const [downloadMonth, setDownloadMonth] = useState(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
  const [filters, setFilters] = useState({ status: "all", facility: "all", user: "all", periodOrder: "desc" });

  function startEdit(reservation) {
    setEditingId(reservation.id);
    setDraft({ ...reservation });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setMessage(null);
  }

  function updateDraft(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setMessage(null);
  }

  async function saveDraft() {
    const conflict = findReservationConflict(reservations, draft, draft.id);
    if (conflict) {
      setMessage({ type: "error", text: conflict.message });
      return;
    }

    const result = await onUpdateReservation(draft.id, draft);
    if (result?.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }

    setMessage({ type: "success", text: "예약 정보가 수정되었습니다." });
    setEditingId(null);
    setDraft(null);
  }

  async function quickStatus(id, status) {
    await onUpdateReservation(id, { status });
  }

  const monthLabel = `${downloadMonth.getFullYear()}_${String(downloadMonth.getMonth() + 1).padStart(2, "0")}`;
  const downloadMonthReservations = useMemo(() => filterReservationsByMonth(reservations, downloadMonth), [reservations, downloadMonth]);
  const downloadYears = useMemo(() => {
    const years = reservations
      .map((reservation) => toDate(reservation.start)?.getFullYear())
      .filter((year) => Number.isInteger(year));
    const uniqueYears = Array.from(new Set([...years, calendarMonth.getFullYear()])).sort((a, b) => b - a);
    return uniqueYears.length ? uniqueYears : [calendarMonth.getFullYear()];
  }, [reservations, calendarMonth]);
  const options = useMemo(() => ({
    status: Array.from(new Set(reservations.map((r) => r.status).filter(Boolean))),
    facility: Array.from(new Set(reservations.map((r) => r.facility).filter(Boolean))),
    user: Array.from(new Set(reservations.map((r) => r.user).filter(Boolean))),
  }), [reservations]);
  const visibleReservations = useMemo(() => {
    const filtered = reservations.filter((r) => {
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.facility !== "all" && r.facility !== filters.facility) return false;
      if (filters.user !== "all" && r.user !== filters.user) return false;
      return true;
    });
    return filtered.sort((a, b) => filters.periodOrder === "asc" ? toDate(a.start) - toDate(b.start) : toDate(b.start) - toDate(a.start));
  }, [reservations, filters]);

  return (
    <div className="card table-card">
      <div className="table-head">
        <div>
          <h3>관리자 예약 승인·수정</h3>
          <p>전체 예약을 수정할 수 있습니다.</p>
        </div>
      </div>     
      {message && <div className={`message ${message.type}`} style={{ margin: 16 }}>{message.text}</div>}
      <div className="table-wrap admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th><HeaderDropdown label="상태" value={filters.status} onChange={(next) => setFilters((p) => ({ ...p, status: next }))} options={[{ value: "all", label: "전체" }, ...options.status.map((v) => ({ value: v, label: getStatusLabel(v) }))]} /></th>
              <th>구분</th>
              <th><HeaderDropdown label="시설/장비" value={filters.facility} onChange={(next) => setFilters((p) => ({ ...p, facility: next }))} options={[{ value: "all", label: "전체" }, ...options.facility.map((v) => ({ value: v, label: v }))]} /></th>
              <th>예약명</th>
              <th>작목</th>
              <th><HeaderDropdown label="신청자" value={filters.user} onChange={(next) => setFilters((p) => ({ ...p, user: next }))} options={[{ value: "all", label: "전체" }, ...options.user.map((v) => ({ value: v, label: v }))]} /></th>
              <th><HeaderDropdown label="시작" value={filters.periodOrder} onChange={(next) => setFilters((p) => ({ ...p, periodOrder: next }))} options={[{ value: "desc", label: "최신순" }, { value: "asc", label: "오래된순" }]} /></th>
              <th>종료</th><th>관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleReservations.map((reservation) => {
              const isEditing = editingId === reservation.id;
              const row = isEditing ? draft : reservation;
              const facilities = getFacilitiesByCategory(row.category);

              return (
                <tr key={reservation.id}>
                  <td>{isEditing ? (
                    <select value={row.status} onChange={(event) => updateDraft("status", event.target.value)}>
                      {Object.values(RESERVATION_STATUS).map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                    </select>
                  ) : <StatusBadge status={reservation.status} />}</td>
                  <td>{isEditing ? (
                    <select value={row.category} onChange={(event) => {
                      const nextCategory = event.target.value;
                      const firstFacility = getFacilitiesByCategory(nextCategory)[0]?.name || "";
                      setDraft((prev) => ({ ...prev, category: nextCategory, facility: firstFacility }));
                    }}>
                      {[CATEGORY.GROWTH, CATEGORY.IMAGING, CATEGORY.MAINTENANCE].map((category) => <option key={category} value={category}>{getCategoryLabel(category)}</option>)}
                    </select>
                  ) : getCategoryLabel(reservation.category)}</td>
                  <td>{isEditing ? (
                    <select value={row.facility} onChange={(event) => updateDraft("facility", event.target.value)}>
                      {facilities.map((facility) => <option key={facility.id} value={facility.name}>{facility.name}</option>)}
                    </select>
                  ) : reservation.facility}</td>
                  <td>{isEditing ? <input value={row.title} onChange={(event) => updateDraft("title", event.target.value)} /> : <strong>{reservation.title}</strong>}</td>
                  <td>{isEditing ? <input value={row.crop} onChange={(event) => updateDraft("crop", event.target.value)} /> : reservation.crop}</td>
                  <td>{isEditing ? <input value={row.user} onChange={(event) => updateDraft("user", event.target.value)} /> : reservation.user}</td>
                  <td>{isEditing ? <input type="datetime-local" value={row.start} onChange={(event) => updateDraft("start", event.target.value)} /> : formatDateTime(reservation.start)}</td>
                  <td>{isEditing ? <input type="datetime-local" value={row.end} onChange={(event) => updateDraft("end", event.target.value)} /> : formatDateTime(reservation.end)}</td>
                  <td>{isEditing ? (
                    <div className="actions admin-row-actions">
                      <Button type="button" onClick={saveDraft}>저장</Button>
                      <Button type="button" variant="light" onClick={cancelEdit}>취소</Button>
                    </div>
                  ) : (
                    <div className="actions admin-row-actions">
                      {reservation.status === RESERVATION_STATUS.PENDING && <Button type="button" onClick={() => quickStatus(reservation.id, RESERVATION_STATUS.APPROVED)}>승인</Button>}
                      {reservation.status === RESERVATION_STATUS.PENDING && <Button type="button" variant="light" onClick={() => quickStatus(reservation.id, RESERVATION_STATUS.REJECTED)}>반려</Button>}
                      <Button type="button" variant="light" onClick={() => startEdit(reservation)}>수정</Button>
                      <Button type="button" variant="danger" onClick={() => onDeleteReservation(reservation.id)}>삭제</Button>
                    </div>
                  )}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function AdminDownloadCard({ reservations, calendarMonth }) {
  const [downloadMonth, setDownloadMonth] = useState(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
  const monthLabel = `${downloadMonth.getFullYear()}_${String(downloadMonth.getMonth() + 1).padStart(2, "0")}`;
  const downloadMonthReservations = useMemo(() => filterReservationsByMonth(reservations, downloadMonth), [reservations, downloadMonth]);
  const downloadYears = useMemo(() => {
    const years = reservations.map((reservation) => toDate(reservation.start)?.getFullYear()).filter((year) => Number.isInteger(year));
    const uniqueYears = Array.from(new Set([...years, calendarMonth.getFullYear()])).sort((a, b) => b - a);
    return uniqueYears.length ? uniqueYears : [calendarMonth.getFullYear()];
  }, [reservations, calendarMonth]);

  return (
    <div className="card table-card">
      <div className="table-head">
        <div>
          <h3>예약 내역 다운로드</h3>
          <p>전체 누적 데이터 또는 선택한 월 데이터만 CSV로 내려받을 수 있습니다.</p>
        </div>
      </div>
      <div className="download-section">
        <div className="actions download-actions">
          <Button type="button" variant="light" onClick={() => downloadReservationsCsv(reservations, "pprc_reservations_all.csv")}>누적 전체 CSV 다운로드</Button>
          <Button type="button" variant="light" onClick={() => downloadReservationsCsv(downloadMonthReservations, `pprc_reservations_${monthLabel}.csv`)}>선택 월 CSV 다운로드</Button>
          <select value={downloadMonth.getFullYear()} onChange={(event) => setDownloadMonth(new Date(Number(event.target.value), downloadMonth.getMonth(), 1))} aria-label="다운로드 연도 선택">
            {downloadYears.map((year) => <option key={year} value={year}>{year}년</option>)}
          </select>
          <select value={downloadMonth.getMonth() + 1} onChange={(event) => setDownloadMonth(new Date(downloadMonth.getFullYear(), Number(event.target.value) - 1, 1))} aria-label="다운로드 월 선택">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}월</option>)}
          </select>
          
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(CATEGORY.ALL);
  const [page, setPage] = useState(PAGE.OVERVIEW);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [reservationsState, setReservationsState] = useState([]);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [reserveInitialCategory, setReserveInitialCategory] = useState(CATEGORY.IMAGING);

  const isAdmin = Boolean(session?.user?.email && adminEmails.includes(session.user.email.toLowerCase()));

  useEffect(() => {
    async function init() {
      if (!isSupabaseConfigured || !supabase) return;
      setLoading(true);
      const { data, error } = await supabase.from("reservations").select("*").order("created_at", { ascending: true });
      if (!error && data) setReservationsState(data.map(mapDbToReservation));
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session || null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function addReservation(reservationOrReservations) {
    if (!isSupabaseConfigured || !supabase) return { error: "Supabase가 설정되지 않았습니다." };
    const reservationsToCreate = Array.isArray(reservationOrReservations) ? reservationOrReservations : [reservationOrReservations];
    const payload = reservationsToCreate.map(mapReservationToDb);
    const { data, error } = await supabase.from("reservations").insert(payload).select();
    if (error) return { error: error.message };

    const savedReservations = (data || []).map(mapDbToReservation);
    try {
      await Promise.all(savedReservations.map((savedReservation) => supabase.functions.invoke("send-reservation-email", {
        body: { reservation: savedReservation },
      })));
    } catch (emailError) {
      console.error("Email notification failed:", emailError);
    }

    setReservationsState((prev) => [...prev, ...savedReservations]);
    return { ok: true };
  }

  async function updateReservation(id, patch) {
    if (!isAdmin) return { error: "관리자 권한이 필요합니다." };
    if (!isSupabaseConfigured || !supabase) return { error: "Supabase가 설정되지 않았습니다." };

    const current = reservationsState.find((reservation) => reservation.id === id);
    const nextReservation = { ...current, ...patch };
    const { data, error } = await supabase.from("reservations").update(mapReservationToDb(nextReservation)).eq("id", id).select().single();
    if (error) return { error: error.message };

    setReservationsState((prev) => prev.map((reservation) => reservation.id === id ? mapDbToReservation(data) : reservation));
    return { ok: true };
  }

  async function deleteReservation(id) {
    if (!isAdmin) return { error: "관리자 권한이 필요합니다." };
    if (!isSupabaseConfigured || !supabase) return { error: "Supabase가 설정되지 않았습니다." };

    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) return { error: error.message };
    setReservationsState((prev) => prev.filter((reservation) => reservation.id !== id));
    return { ok: true };
  }

  async function logoutAdmin() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  const selectedMonthReservations = useMemo(() => filterReservationsByMonth(reservationsState, calendarMonth), [reservationsState, calendarMonth]);
  const filteredReservations = useMemo(() => filterReservationsByCategory(selectedMonthReservations, tab), [selectedMonthReservations, tab]);
  const selectedMonthStats = useMemo(() => getReservationStats(selectedMonthReservations), [selectedMonthReservations]);
  const allReservationStats = useMemo(() => getReservationStats(reservationsState), [reservationsState]);
  const todayFacilityStatusMap = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const map = new Map();
    allFacilities.forEach((facility) => map.set(facility.name, FACILITY_STATUS.AVAILABLE));
    reservationsState.forEach((reservation) => {
      if (reservation.status === RESERVATION_STATUS.REJECTED) return;
      if (!rangesOverlap(toDate(reservation.start), toDate(reservation.end), today, tomorrow)) return;
      map.set(reservation.facility, FACILITY_STATUS.IN_USE);
    });
    return map;
  }, [reservationsState]);

  const facilityStatusStats = useMemo(() => {
    return allFacilities.reduce((acc, facility) => {
      acc[facility.status] = (acc[facility.status] || 0) + 1;
      return acc;
    }, {});
  }, []);

  const dashboardCards = [
    { label: "해당 월 전체 예약", value: selectedMonthStats.total, icon: categoryIcon[CATEGORY.ALL], helper: `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월 기준` },
    { label: "사용 중 시설", value: facilityStatusStats[FACILITY_STATUS.IN_USE] || 0, icon: "🔵", helper: "현재 사용 중" },
    { label: "승인 대기 예약", value: allReservationStats.pending, icon: "🟡", helper: "전체 기간 기준" },
  ];

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div>
            <p><strong>Phenotyping Facility Reservation System</strong></p>
            <h1>표현체 연구시설 예약 시스템</h1>
            <p>재배시설은 장기 재배 예약으로, 촬영시설은 시간 단위 예약으로 분리 관리합니다. 예약 데이터는 Supabase 프로젝트 DB에 저장됩니다.</p>
            {loading && <p>예약 데이터를 불러오는 중입니다...</p>}
          </div>
          <div className="mode-tabs">
            <button type="button" onClick={() => setPage(PAGE.OVERVIEW)} className={page === PAGE.OVERVIEW ? "active" : ""}>시설현황</button>
            <button type="button" onClick={() => setPage(PAGE.STATUS)} className={page === PAGE.STATUS ? "active" : ""}>예약현황</button>
            <button type="button" onClick={() => setPage(PAGE.RESERVE)} className={page === PAGE.RESERVE ? "active" : ""}>예약하기</button>
            <button type="button" onClick={() => setPage(PAGE.ADMIN)} className={page === PAGE.ADMIN ? "active" : ""}>관리자</button>
          </div>
        </header>


        {page === PAGE.OVERVIEW && (
          <div className="user-layout">
            <section className="user-growth-section">
              <SectionTitle icon={categoryIcon[CATEGORY.GROWTH]} title="재배시설" subtitle="기간 단위로 예약하고, 필요 시 촬영 예약과 연결합니다." />
              <div className="grid-5" style={{ marginTop: 14 }}>
                {growthFacilities.map((item) => <FacilityCard key={item.id} item={{ ...item, status: todayFacilityStatusMap.get(item.name) || FACILITY_STATUS.AVAILABLE }} />)}
              </div>
            </section>

            <section className="user-imaging-section">
              <SectionTitle icon={categoryIcon[CATEGORY.IMAGING]} title="촬영시설 및 장비" subtitle="시간 단위 예약, 연계 촬영과 독립 촬영을 구분합니다." />
              <div className="grid-5" style={{ marginTop: 14 }}>
                {imagingFacilities.map((item) => <FacilityCard key={item.id} item={{ ...item, status: todayFacilityStatusMap.get(item.name) || FACILITY_STATUS.AVAILABLE }} />)}
              </div>
            </section>
          </div>
        )}

        {page === PAGE.STATUS && (
          <div className="user-layout">
            <section>
              <div className="filter-row">
                {[CATEGORY.ALL, CATEGORY.GROWTH, CATEGORY.IMAGING, CATEGORY.MAINTENANCE].map((name) => (
                  <button key={name} type="button" onClick={() => setTab(name)} className={`chip ${tab === name ? "active" : ""}`}>{getCategoryLabel(name)}</button>
                ))}
              </div>
            </section>
            <MonthlyCalendar reservations={reservationsState} selectedCategory={tab} month={calendarMonth} onMonthChange={setCalendarMonth} />
            <ReservationTable reservations={filteredReservations} />
          </div>
        )}

        {page === PAGE.RESERVE && (
          <section className="two-col user-reservation-section">
            <ReservationForm reservations={reservationsState} onAddReservation={addReservation} disabled={!isSupabaseConfigured} isAdmin={isAdmin} initialCategory={reserveInitialCategory} />
            <div className="card rules">
              <h3>예약 운영 규칙</h3>
              <p>- 재배시설과 촬영 장비는 각각 <strong>별도의 예약</strong>으로 신청해야 합니다.</p>
              <p>- 동일 시설/장비에 대해 예약 또는 점검 일정이 중복될 경우 신청이 제한됩니다.</p>
              <p>- 예약 <strong>변경 및 취소</strong>는 관리자에게 사전 연락 후 처리해야 합니다.</p>
              
              <p><strong>※ 예약 입력 방식 설명</strong></p>
              <p>- 단일 기간/시간: 일회성 촬영</p>
              <p>- 기간 내 매일 같은 시간: 반복 촬영</p>
              
              <p><strong>※ 촬영 방식 설명</strong></p>
              <p>- 연계 촬영: 컨베이어/XYZ 재배시설에서 재배 중인 작물의 촬영</p>
              <p>- 독립 촬영: 이외의 나머지 경우(default)</p>
                
              <p><strong>※ 관리자 문의:</strong> 윤효인 연구사, 형성철 연구원</p>
            </div>
          </section>
        )}


        {page === PAGE.ADMIN && (
          <>
            <AdminLogin session={session} onLogin={setSession} onLogout={logoutAdmin} isAdmin={isAdmin} />
            {isAdmin && (
              <>
                <section className="dashboard">
                  {dashboardCards.map((card) => (
                    <div key={card.label} className="card stat">
                      <div>
                        <div className="label">{card.label}</div>
                        <div className="value">{card.value}</div>
                        <div className="helper">{card.helper}</div>
                      </div>
                      <div className="icon">{card.icon}</div>
                    </div>
                  ))}
                  <div className="card stat">
                    <div>
                      <div className="label">점검 빠른 등록</div>
                      <div className="helper">해당 월 점검 일정을 바로 등록합니다.</div>
                    </div>
                    <div className="actions">
                      <Button type="button" onClick={() => { setReserveInitialCategory(CATEGORY.MAINTENANCE); setPage(PAGE.RESERVE); }}>🛠 점검 등록</Button>
                    </div>
                  </div>
                </section>
                <AdminReservationPanel
                reservations={reservationsState}
                onUpdateReservation={updateReservation}
                onDeleteReservation={deleteReservation}
                calendarMonth={calendarMonth}
              />
              <AdminDownloadCard reservations={reservationsState} calendarMonth={calendarMonth} />
              </>
            )}
          </>
        )}

      </div>

      <footer className="footer-note">
        <p>본 시스템은 표현체 연구시설의 재배 및 촬영 장비 예약을 위한 플랫폼입니다.</p>
        <p>국립원예특작과학원 채소기초기반과</p>
        <p>담당자 문의: 063-238-6623 | yoonplant@korea.kr</p>
        <p>Ver. 1.3 (2026.06)</p>
      </footer>
    </div>
  );
}
