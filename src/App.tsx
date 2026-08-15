import { useState } from 'react'
import { TrackScreen } from './screens/TrackScreen'
import { RidesScreen } from './screens/RidesScreen'
import { RideDetailScreen } from './screens/RideDetailScreen'
import { GarageScreen } from './screens/GarageScreen'
import { ManeuverIconPreview } from './components/ManeuverIcon.preview'
import './App.css'

type Tab = 'track' | 'rides' | 'garage'

export default function App() {
  // Службова сторінка для звірки піктограм: ?icons=1
  if (new URLSearchParams(location.search).get('icons') === '1') {
    return <ManeuverIconPreview />
  }

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

      <div className="page" hidden={tab !== 'garage'}>
        {tab === 'garage' && <GarageScreen />}
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
        <button className={tab === 'garage' ? 'active' : ''} onClick={() => setTab('garage')}>
          <span className="tab-icon">⚙</span>
          Гараж
        </button>
      </nav>
    </div>
  )
}
