import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, deleteBike, type Bike, type ServiceItem } from '../db'
import { DEFAULT_ITEMS, serviceState } from '../lib/service'
import { formatDate } from '../lib/geo'
import { FamilySection } from '../components/FamilySection'
import { AboutSection } from '../components/AboutSection'

export function GarageScreen() {
  // Саме toArray, а не first(): порожня таблиця має відрізнятись від
  // «запит ще не виконався», інакше екран назавжди застрягає на «Завантаження».
  const bikes = useLiveQuery(() => db.bikes.orderBy('createdAt').toArray(), [])
  const rides = useLiveQuery(() => db.rides.toArray(), [])

  if (bikes === undefined || rides === undefined) return <div className="screen pad">Завантаження…</div>
  const bike = bikes[0]
  if (!bike) return <AddBikeForm />

  // Пробіг = те, що було на одометрі, плюс усе, що застосунок записав відтоді.
  const trackedKm =
    rides.filter((r) => r.startedAt >= bike.baseAt).reduce((sum, r) => sum + r.distance, 0) / 1000

  return <Garage bike={bike} trackedKm={trackedKm} />
}

function Garage({ bike, trackedKm }: { bike: Bike; trackedKm: number }) {
  const odo = bike.baseOdo + trackedKm
  const items = useLiveQuery(() => db.serviceItems.where('bikeId').equals(bike.id!).toArray(), [bike.id])
  const log = useLiveQuery(
    () => db.serviceLog.where('bikeId').equals(bike.id!).reverse().sortBy('at'),
    [bike.id],
  )

  const [editOdo, setEditOdo] = useState(false)
  const [addItem, setAddItem] = useState(false)
  const [doneFor, setDoneFor] = useState<ServiceItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sorted = (items ?? [])
    .map((it) => ({ it, st: serviceState(it, odo) }))
    .sort((a, b) => b.st.progress - a.st.progress)

  return (
    <div className="screen pad scroll">
      <header className="bike-head">
        <div>
          <h2>{bike.name}</h2>
          {bike.model && <div className="muted small">{bike.model}</div>}
        </div>
      </header>

      <button className="odo-card" onClick={() => setEditOdo(true)}>
        <div className="odo-value">{Math.round(odo).toLocaleString('uk-UA')}</div>
        <div className="odo-label">
          кілометрів на одометрі
          {trackedKm >= 1 && ` · ${Math.round(trackedKm)} з них записав застосунок`}
        </div>
        <div className="odo-hint">Натисни, щоб виправити</div>
      </button>

      {editOdo && <OdoForm bike={bike} current={odo} onClose={() => setEditOdo(false)} />}

      <div className="section-head">
        <h3>Обслуговування</h3>
        <button className="link-btn" onClick={() => setAddItem(true)}>
          + Додати
        </button>
      </div>

      {addItem && <ItemForm bikeId={bike.id!} odo={odo} onClose={() => setAddItem(false)} />}

      {sorted.length === 0 && !addItem && (
        <p className="muted small">Поки що порожньо. Додай перший пункт — наприклад, мастило ланцюга.</p>
      )}

      <ul className="service-list">
        {sorted.map(({ it, st }) => (
          <li key={it.id} className={`service-card ${st.status}`}>
            <div className="service-top">
              <span className="service-title">{it.title}</span>
              <button className="done-btn" onClick={() => setDoneFor(it)}>
                Зроблено
              </button>
            </div>
            <div className="bar">
              <span style={{ width: `${st.progress * 100}%` }} />
            </div>
            <div className="service-meta">{st.label}</div>
          </li>
        ))}
      </ul>

      {doneFor && (
        <DoneForm item={doneFor} bikeId={bike.id!} odo={odo} onClose={() => setDoneFor(null)} />
      )}

      {(log ?? []).length > 0 && (
        <>
          <div className="section-head">
            <h3>Журнал робіт</h3>
          </div>
          <ul className="log-list">
            {(log ?? []).map((entry) => (
              <li key={entry.id} className="log-row">
                <div>
                  <div className="log-title">{entry.title}</div>
                  <div className="muted small">
                    {formatDate(entry.at)} · {Math.round(entry.odo).toLocaleString('uk-UA')} км
                    {entry.notes && ` · ${entry.notes}`}
                  </div>
                </div>
                {entry.cost > 0 && <div className="log-cost">{entry.cost.toLocaleString('uk-UA')} ₴</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      <FamilySection />
      <AboutSection />

      {confirmDelete ? (
        <div className="confirm">
          <span>Видалити мотоцикл разом з усім обслуговуванням і журналом?</span>
          <button className="btn btn-stop" onClick={() => deleteBike(bike.id!)}>
            Так, видалити
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
            Скасувати
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost danger spaced" onClick={() => setConfirmDelete(true)}>
          Видалити мотоцикл
        </button>
      )}
    </div>
  )
}

function AddBikeForm() {
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [odo, setOdo] = useState('')
  const [withDefaults, setWithDefaults] = useState(true)

  async function save() {
    const bikeId = (await db.bikes.add({
      name: name.trim() || 'Мій мотоцикл',
      model: model.trim(),
      baseOdo: Number(odo.replace(',', '.')) || 0,
      baseAt: Date.now(),
      createdAt: Date.now(),
    })) as number

    if (withDefaults) {
      const base = Number(odo.replace(',', '.')) || 0
      await db.serviceItems.bulkAdd(
        DEFAULT_ITEMS.map((d) => ({
          bikeId,
          title: d.title,
          intervalKm: d.intervalKm,
          intervalDays: d.intervalDays,
          lastDoneOdo: base,
          lastDoneAt: Date.now(),
        })),
      )
    }
  }

  return (
    <div className="screen pad scroll">
      <div className="empty-icon">🏍️</div>
      <h2 className="center">Гараж порожній</h2>
      <p className="muted center">Додай мотоцикл — і застосунок сам стежитиме за пробігом та розхідниками.</p>

      <label className="field">
        <span>Назва</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Мій мотоцикл" />
      </label>
      <label className="field">
        <span>Модель</span>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Honda CB500X" />
      </label>
      <label className="field">
        <span>Пробіг зараз, км</span>
        <input
          value={odo}
          onChange={(e) => setOdo(e.target.value)}
          inputMode="decimal"
          placeholder="24500"
        />
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={withDefaults} onChange={(e) => setWithDefaults(e.target.checked)} />
        <span>Додати типові пункти обслуговування (олива, ланцюг, колодки…)</span>
      </label>

      <button className="btn btn-primary btn-big" onClick={save}>
        Додати мотоцикл
      </button>

      <FamilySection />
      <AboutSection />
    </div>
  )
}

function OdoForm({ bike, current, onClose }: { bike: Bike; current: number; onClose: () => void }) {
  const [value, setValue] = useState(String(Math.round(current)))

  async function save() {
    const km = Number(value.replace(',', '.'))
    if (!isFinite(km) || km < 0) return onClose()
    // Обнуляємо відлік: далі до цього числа додаються тільки нові поїздки.
    await db.bikes.update(bike.id!, { baseOdo: km, baseAt: Date.now() })
    onClose()
  }

  return (
    <div className="sheet">
      <label className="field">
        <span>Пробіг на одометрі, км</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus />
      </label>
      <div className="controls">
        <button className="btn btn-ghost" onClick={onClose}>
          Скасувати
        </button>
        <button className="btn btn-primary" onClick={save}>
          Зберегти
        </button>
      </div>
    </div>
  )
}

function ItemForm({ bikeId, odo, onClose }: { bikeId: number; odo: number; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [km, setKm] = useState('')
  const [days, setDays] = useState('')

  async function save() {
    if (!title.trim()) return onClose()
    await db.serviceItems.add({
      bikeId,
      title: title.trim(),
      intervalKm: Number(km) > 0 ? Number(km) : null,
      intervalDays: Number(days) > 0 ? Number(days) : null,
      lastDoneOdo: odo,
      lastDoneAt: Date.now(),
    })
    onClose()
  }

  return (
    <div className="sheet">
      <label className="field">
        <span>Що обслуговуємо</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Свічки запалювання"
          autoFocus
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Кожні, км</span>
          <input value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" placeholder="6000" />
        </label>
        <label className="field">
          <span>або кожні, днів</span>
          <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" placeholder="365" />
        </label>
      </div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={onClose}>
          Скасувати
        </button>
        <button className="btn btn-primary" onClick={save}>
          Додати
        </button>
      </div>
    </div>
  )
}

function DoneForm({
  item,
  bikeId,
  odo,
  onClose,
}: {
  item: ServiceItem
  bikeId: number
  odo: number
  onClose: () => void
}) {
  const [atOdo, setAtOdo] = useState(String(Math.round(odo)))
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')

  async function save() {
    const doneOdo = Number(atOdo.replace(',', '.')) || odo
    await db.transaction('rw', db.serviceItems, db.serviceLog, async () => {
      await db.serviceItems.update(item.id!, { lastDoneOdo: doneOdo, lastDoneAt: Date.now() })
      await db.serviceLog.add({
        bikeId,
        itemId: item.id!,
        title: item.title,
        odo: doneOdo,
        at: Date.now(),
        cost: Number(cost.replace(',', '.')) || 0,
        notes: notes.trim(),
      })
    })
    onClose()
  }

  return (
    <div className="sheet">
      <div className="sheet-title">{item.title}</div>
      <div className="field-row">
        <label className="field">
          <span>На пробігу, км</span>
          <input value={atOdo} onChange={(e) => setAtOdo(e.target.value)} inputMode="decimal" />
        </label>
        <label className="field">
          <span>Вартість, ₴</span>
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="0" />
        </label>
      </div>
      <label className="field">
        <span>Нотатка</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Motul 7100, фільтр HF204"
        />
      </label>
      <div className="controls">
        <button className="btn btn-ghost" onClick={onClose}>
          Скасувати
        </button>
        <button className="btn btn-primary" onClick={save}>
          Записати
        </button>
      </div>
    </div>
  )
}
