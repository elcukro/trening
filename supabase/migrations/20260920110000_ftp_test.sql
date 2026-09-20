-- Plan z 20.09: test progowy z miernikiem mocy (20 min) jako protokół domyślny.
alter table public.test_results drop constraint if exists test_results_protocol_check;
alter table public.test_results add constraint test_results_protocol_check check (protocol in ('TEST_LTHR', 'WATTBIKE_TEST', 'FTP_TEST'));
