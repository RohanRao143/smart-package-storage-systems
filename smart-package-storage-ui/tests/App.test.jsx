import React from 'react';
import {
  render,
  screen,
} from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import { describe, expect, it, vi } from 'vitest';

import App from '../src/App';

describe('Smart Package Storage UI', () => {
  it('renders the application', () => {
    render(<App />);

    expect(
      screen.getByText(/Smart Package Storage/i),
    ).toBeInTheDocument();
  });

  it('shows the delivery agent workflow', () => {
    render(<App />);

    expect(
      screen.getByText(/Delivery Agent/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/customer username/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/package name/i),
    ).toBeInTheDocument();
  });

  it('shows package dimensions', () => {
    render(<App />);

    expect(
      screen.getByLabelText(/width/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/height/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/breadth/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/weight/i),
    ).toBeInTheDocument();
  });

  it('provides fragile package selection', () => {
    render(<App />);

    expect(
      screen.getByLabelText(/fragile/i),
    ).toBeInTheDocument();
  });

  it('allows switching to customer workflow', async () => {
    const user = userEvent.setup();

    render(<App />);

    const customerTab =
      screen.getByText(/Customer/i);

    await user.click(customerTab);

    expect(
      screen.getByText(/Locker ID/i),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Pickup Code/i),
    ).toBeInTheDocument();
  });
});