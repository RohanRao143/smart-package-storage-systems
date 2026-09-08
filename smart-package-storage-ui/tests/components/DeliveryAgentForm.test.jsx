import React from 'react';
import {
  render,
  screen,
} from '@testing-library/react';

import userEvent from '@testing-library/user-event';

import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import App from '../../src/App';

describe('Delivery Agent form', () => {
  it('requires customer username', async () => {
    const user = userEvent.setup();

    render(<App />);

    const submit =
      screen.getByRole('button', {
        name: /store|submit/i,
      });

    await user.click(submit);

    expect(
      screen.getByText(
        /customer username/i,
      ),
    ).toBeInTheDocument();
  });

  it('rejects invalid dimensions', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(
      screen.getByLabelText(/customer username/i),
      'customer01',
    );

    await user.type(
      screen.getByLabelText(/width/i),
      '-1',
    );

    const submit =
      screen.getByRole('button', {
        name: /store|submit/i,
      });

    await user.click(submit);

    expect(
      screen.getByText(
        /Width \(cm\)/i,
      ),
    ).toBeInTheDocument();
  });

  it('does not allow zero weight', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.type(
      screen.getByLabelText(/weight/i),
      '0',
    );

    const submit =
      screen.getByRole('button', {
        name: /store|submit/i,
      });

    await user.click(submit);

    expect(
      screen.getByText(
        /Weight \(grams\)/i,
      ),
    ).toBeInTheDocument();
  });
});