// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceAuthOverlay from './WorkspaceAuthOverlay'

afterEach(() => {
  cleanup()
})

describe('WorkspaceAuthOverlay', () => {
  it('renders context panel and triggers close callback', () => {
    const onCloseInfo = vi.fn()

    render(
      <WorkspaceAuthOverlay
        isLoading={false}
        infoOpen={true}
        activeTab="login"
        authError={null}
        runtimeError={null}
        onCloseInfo={onCloseInfo}
        onOpenInfo={vi.fn()}
        onChangeTab={vi.fn()}
        onStartAuth={vi.fn()}
      />,
    )

    expect(screen.queryByText('Session Context')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hide context panel' }))
    expect(onCloseInfo).toHaveBeenCalledTimes(1)
  })

  it('shows help button when context panel is hidden', () => {
    const onOpenInfo = vi.fn()

    render(
      <WorkspaceAuthOverlay
        isLoading={false}
        infoOpen={false}
        activeTab="login"
        authError={null}
        runtimeError={null}
        onCloseInfo={vi.fn()}
        onOpenInfo={onOpenInfo}
        onChangeTab={vi.fn()}
        onStartAuth={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Hide context panel' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show context panel' }))
    expect(onOpenInfo).toHaveBeenCalledTimes(1)
  })

  it('calls auth callbacks for register tab and social buttons', () => {
    const onChangeTab = vi.fn()
    const onStartAuth = vi.fn()

    render(
      <WorkspaceAuthOverlay
        isLoading={false}
        infoOpen={true}
        activeTab="register"
        authError={null}
        runtimeError={null}
        onCloseInfo={vi.fn()}
        onOpenInfo={vi.fn()}
        onChangeTab={onChangeTab}
        onStartAuth={onStartAuth}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Log in$/ }))
    expect(onChangeTab).toHaveBeenCalledWith('login')

    fireEvent.click(screen.getByRole('button', { name: 'Create account with Auth0' }))
    expect(onStartAuth).toHaveBeenCalledWith('register')

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(onStartAuth).toHaveBeenCalledWith('register', 'google-oauth2')

    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    expect(onStartAuth).toHaveBeenCalledWith('register', 'github')
  })
})
