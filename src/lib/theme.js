import { useCallback, useEffect, useState } from 'react'

/**
 * 화면 테마 — 'system' | 'light' | 'dark'
 * 선택값은 localStorage에, 실제 적용은 <html class="dark"> 로.
 * 첫 화면이 번쩍이지 않도록 index.html 의 인라인 스크립트에서도 같은 키를 읽는다.
 */
export const THEME_KEY = 'ox-wrongnote-theme-v1'

export const THEME_OPTIONS = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
]

/* 브라우저 상단 바 색 — 라이트는 기존 값 그대로 */
const META_COLOR = { light: '#1e293b', dark: '#0f172a' }

export function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function saveTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* 사생활 보호 모드 등 — 저장 실패해도 이번 세션에는 적용된다 */
  }
}

function darkMedia() {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
}

/** 설정값 → 실제로 어둡게 보여줄지 */
export function resolveTheme(theme) {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return !!darkMedia()?.matches
}

export function applyTheme(theme) {
  const dark = resolveTheme(theme)
  document.documentElement.classList.toggle('dark', dark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? META_COLOR.dark : META_COLOR.light)
  return dark
}

export function useTheme() {
  const [theme, setThemeState] = useState(loadTheme)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    // 시스템 설정을 따르는 동안에는 OS 테마가 바뀌면 같이 바뀐다
    const m = darkMedia()
    if (!m?.addEventListener) return
    const onChange = () => applyTheme('system')
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((next) => {
    saveTheme(next)
    setThemeState(next)
  }, [])

  return [theme, setTheme]
}
