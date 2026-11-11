import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/** A rendering bug must never leave the user with a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="page">
        <div className="alert alert-error" role="alert">
          <p>
            <strong>দুঃখিত, পেজটি দেখাতে একটি সমস্যা হয়েছে।</strong>
          </p>
          <p>আপনার আবেদনের তথ্য সার্ভারে নিরাপদ আছে। পেজটি আবার লোড করুন।</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            আবার লোড করুন
          </button>
        </div>
      </div>
    )
  }
}
