import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import { ApolloProvider } from 'react-apollo'
// import { persistCache } from 'apollo-cache-persist'
import { HashRouter } from 'react-router-dom'

import Styl from 'react-styl'
import client from 'origin-graphql'

import setLocale from 'utils/setLocale'

import App from './pages/App'
import Analytics from './components/Analytics'
import './css/app.css'
if (process.env.NODE_ENV === 'production') {
  try {
    require('../public/app.css')
  } catch (e) {
    console.log('No built CSS found')
  }
}

class AppWrapper extends Component {
  state = { ready: false, client: null }

  async componentDidMount() {
    try {
      // await persistCache({
      //   cache: client.cache,
      //   storage: window.sessionStorage
      // })
      const locale = await setLocale()
      this.setState({ ready: true, client, locale })
    } catch (error) {
      console.error('Error restoring Apollo cache', error)
    }
  }

  render() {
    if (!this.state.ready) return null
    return (
      <ApolloProvider client={client}>
        <HashRouter>
          <Analytics>
            <App
              locale={this.state.locale}
              onLocale={async newLocale => {
                const locale = await setLocale(newLocale)
                this.setState({ locale })
                window.scrollTo(0, 0)
              }}
            />
          </Analytics>
        </HashRouter>
      </ApolloProvider>
    )
  }
}

ReactDOM.render(<AppWrapper />, document.getElementById('app'))

Styl.addStylesheet()
