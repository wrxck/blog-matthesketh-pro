import { spawn } from 'node:child_process'
import { config } from './config.js'

interface BuildState {
  status: 'idle' | 'building' | 'success' | 'error'
  startedAt: number | null
  completedAt: number | null
  error: string | null
}

const state: BuildState = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  error: null,
}

export function getBuildStatus(): BuildState {
  return { ...state }
}

export function triggerBuild(): Promise<BuildState> {
  if (state.status === 'building') {
    return Promise.resolve({ ...state })
  }

  state.status = 'building'
  state.startedAt = Date.now()
  state.completedAt = null
  state.error = null

  return new Promise((resolve) => {
    // Build from blog source dir, output to the dist dir the server serves
    const child = spawn('npx', ['utopia', 'build', '--outDir', config.distDir], {
      cwd: config.blogDir,
      env: { ...process.env },
      stdio: 'pipe',
    })

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      state.completedAt = Date.now()
      if (code === 0) {
        state.status = 'success'
        state.error = null
      } else {
        state.status = 'error'
        state.error = stderr || `Build exited with code ${code}`
      }
      resolve({ ...state })
    })

    child.on('error', (err) => {
      state.completedAt = Date.now()
      state.status = 'error'
      state.error = err.message
      resolve({ ...state })
    })
  })
}
