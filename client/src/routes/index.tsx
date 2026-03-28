import { createFileRoute } from '@tanstack/react-router'
import LandingRobotStory from '../components/landing/LandingRobotStory'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return <LandingRobotStory />
}
