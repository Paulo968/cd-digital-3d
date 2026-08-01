import { useEffect, useState } from 'react'
import { RealisticRackEditor } from '../features/realistic/RealisticRackEditor'
import { useDigitalTwinStore } from '../store/digitalTwinStore'
import OperationalApp from './App'
import './experience-root.css'

type ExperienceMode = 'operational' | 'realistic'

const EXPERIENCE_MODE_KEY = 'cd-digital-3d-experience-mode'

function initialMode(): ExperienceMode {
  const saved = window.localStorage.getItem(EXPERIENCE_MODE_KEY)
  return saved === 'realistic' ? 'realistic' : 'operational'
}

export default function ExperienceRoot() {
  const [mode, setMode] = useState<ExperienceMode>(initialMode)
  const setRenderMode = useDigitalTwinStore((state) => state.setRenderMode)

  useEffect(() => {
    window.localStorage.setItem(EXPERIENCE_MODE_KEY, mode)
    if (mode === 'operational') setRenderMode('operational')
  }, [mode, setRenderMode])

  return (
    <main className={`experience-root experience-${mode}`}>
      <header className="experience-topbar">
        <div className="experience-title">
          <strong>CD Digital 3D</strong>
          <span>{mode === 'operational' ? 'Operação' : 'Editor realista'}</span>
        </div>

        <nav className="experience-menu" aria-label="Áreas principais">
          <button
            type="button"
            className={mode === 'operational' ? 'active' : ''}
            aria-pressed={mode === 'operational'}
            onClick={() => setMode('operational')}
          >
            <span>▦</span>
            Operacional
          </button>
          <button
            type="button"
            className={mode === 'realistic' ? 'active' : ''}
            aria-pressed={mode === 'realistic'}
            onClick={() => setMode('realistic')}
          >
            <span>◫</span>
            Realista
          </button>
        </nav>

        <div className="experience-status">
          {mode === 'operational' ? 'Sistema atual preservado' : 'Nenhuma simulação rodando'}
        </div>
      </header>

      <section className="experience-stage">
        {mode === 'operational' ? (
          <div className="operational-host">
            <OperationalApp />
          </div>
        ) : (
          <RealisticRackEditor />
        )}
      </section>
    </main>
  )
}
