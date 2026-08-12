import { useState } from 'react'
import { TrackScreen } from './screens/TrackScreen'
import { RidesScreen } from './screens/RidesScreen'
import { RideDetailScreen } from './screens/RideDetailScreen'
import './App.css'

type Tab = 'track' | 'rides'

export default function App() {
  const [tab, setTab] = useState<Tab>('track')
  const [openRide, setOpenRide] = useState<number | null>(null)

  function openRideDetail(id: number) {
    setOpenRide(id)
    setTab('rides')
  }

  return (
    <div className="app">
      {/* Екран поїздки не розмонтовуємо — інакше перемикання вкладки
          обірве запис треку. Просто ховаємо його. */}
      <div className="page" hidden={tab !== 'track'}>
        <TrackScreen onFinished={openRideDetail} />
      </div>

      <div className="page" hidden={tab !== 'rides'}>
        {openRide != null ? (
          <RideDetailScreen rideId={openRide} onBack={() => setOpenRide(null)} />
        ) : (
          <RidesScreen onOpen={setOpenRide} />
        )}
      </div>

      <nav className="tabbar">
        <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>
          <span className="tab-icon">▲</span>
          Поїздка
        </button>
        <button
          className={tab === 'rides' ? 'active' : ''}
          onClick={() => {
            setTab('rides')
            setOpenRide(null)
          }}
        >
          <span className="tab-icon">≡</span>
          Історія
        </button>
      </nav>
    </div>
  )
}
