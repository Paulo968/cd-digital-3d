import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealisticExperienceStore } from './realisticExperienceStore'

describe('realisticExperienceStore', () => {
  beforeEach(() => {
    useRealisticExperienceStore.setState({
      connected: false,
      controller: null,
      timeScale: 2,
      paused: false,
      cameraMode: 'cinematic',
    })
  })

  it('encaminha os controles do menu para o runtime 3D', () => {
    const controller = {
      setTimeScale: vi.fn(),
      togglePause: vi.fn(),
      stepOnce: vi.fn(),
      reset: vi.fn(),
      setCameraMode: vi.fn(),
    }

    useRealisticExperienceStore.getState().registerController(controller)
    useRealisticExperienceStore.getState().changeTimeScale(4)
    useRealisticExperienceStore.getState().togglePause()
    useRealisticExperienceStore.getState().stepOnce()
    useRealisticExperienceStore.getState().changeCameraMode('follow')
    useRealisticExperienceStore.getState().reset()

    expect(controller.setTimeScale).toHaveBeenCalledWith(4)
    expect(controller.togglePause).toHaveBeenCalledOnce()
    expect(controller.stepOnce).toHaveBeenCalledOnce()
    expect(controller.setCameraMode).toHaveBeenCalledWith('follow')
    expect(controller.reset).toHaveBeenCalledOnce()

    const state = useRealisticExperienceStore.getState()
    expect(state.connected).toBe(true)
    expect(state.timeScale).toBe(4)
    expect(state.paused).toBe(false)
    expect(state.cameraMode).toBe('follow')
  })

  it('não avança tick quando a operação está rodando', () => {
    const stepOnce = vi.fn()

    useRealisticExperienceStore.getState().registerController({
      setTimeScale: vi.fn(),
      togglePause: vi.fn(),
      stepOnce,
      reset: vi.fn(),
      setCameraMode: vi.fn(),
    })

    useRealisticExperienceStore.getState().stepOnce()

    expect(stepOnce).not.toHaveBeenCalled()
  })
})
